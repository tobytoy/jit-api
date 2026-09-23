import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SchemaObserver } from './observer.js';
import { SchemaStore } from './schema_store.js';
import { IRSchema } from './types.js';

export interface ProxyRecorderOptions {
  targetUrl: string; // Real backend URL
  port?: number;
  specsDir?: string;
  schemaStorePath?: string;
  offline?: boolean; // If true, only serve from Digital Twin
  autoFailover?: boolean; // If true, fallback to Digital Twin on target failure (default: true)
  stabilityThreshold?: number; // default: 3
}

export class ProxyRecorder {
  private app: Express;
  private server?: http.Server;
  private targetUrl: string;
  private port: number;
  private specsDir: string;
  private offline: boolean;
  private autoFailover: boolean;
  private observer: SchemaObserver;
  private schemaStore: SchemaStore;
  private recordedCount: Map<string, number> = new Map();

  constructor(options: ProxyRecorderOptions) {
    this.targetUrl = options.targetUrl.replace(/\/+$/, '');
    this.port = options.port ?? 3005;
    this.specsDir = options.specsDir ? path.resolve(options.specsDir) : path.resolve(process.cwd(), 'specs');
    this.offline = options.offline ?? false;
    this.autoFailover = options.autoFailover ?? true;

    const storePath = options.schemaStorePath ?? (options.specsDir ? path.join(this.specsDir, 'schemas.json') : undefined);
    this.schemaStore = new SchemaStore({ filePath: storePath });

    if (!fs.existsSync(this.specsDir)) {
      fs.mkdirSync(this.specsDir, { recursive: true });
    }

    this.observer = new SchemaObserver({
      stabilityThreshold: options.stabilityThreshold ?? 3,
      onFreeze: async (schema: IRSchema) => {
        this.saveRecordedSpec(schema);
        this.schemaStore.save(this.observer.exportSnapshots());
      },
    });

    // Preload snapshots if available
    const snapshot = this.schemaStore.load();
    if (snapshot) {
      this.observer.importSnapshots(snapshot);
    }

    this.app = express();
    this.app.use(express.json());
    this.setupProxyRoutes();
  }

  /**
   * Save auto-recorded spec as a Markdown API file in specs/
   */
  private saveRecordedSpec(schema: IRSchema): void {
    const fieldsList = Object.entries(schema.fields)
      .map(([k, f]) => `- ${k}: ${f.type}`)
      .join('\n');

    const sampleReq = JSON.stringify(schema.samplePayload || {}, null, 2);
    const sampleRes = JSON.stringify(schema.sampleResponse || {}, null, 2);

    const mdContent = `# API: ${schema.route}
Version: 1.0.0
Stage: dev
> Auto-recorded from live traffic by JIT Proxy Recorder

## Intent
Auto-recorded API endpoint for ${schema.route}

## Fields
${fieldsList}

## Sample
- Payload:
\`\`\`json
${sampleReq}
\`\`\`

## Mock
\`\`\`json
${sampleRes}
\`\`\`
`;

    const fileName = `recorded_${schema.route}.api.md`;
    const targetPath = path.join(this.specsDir, fileName);
    fs.writeFileSync(targetPath, mdContent, 'utf-8');
    console.log(`✨ [ProxyRecorder] Auto-crystallized spec: ${targetPath}`);
  }

  private setupProxyRoutes(): void {
    // Proxy info endpoint
    this.app.get('/api/proxy/status', (req: Request, res: Response) => {
      res.json({
        service: 'JIT-API Smart Recording Proxy & Digital Twin',
        targetUrl: this.targetUrl,
        port: this.port,
        offlineMode: this.offline,
        autoFailover: this.autoFailover,
        recordedRoutes: Array.from(this.recordedCount.entries()).map(([route, count]) => ({
          route,
          sampleCount: count,
          isFrozen: this.observer.isFrozen(route),
        })),
      });
    });

    // Universal proxy interceptor
    this.app.all('*', async (req: Request, res: Response) => {
      // Ignore internal status route
      if (req.path === '/api/proxy/status') return;

      const rawRoute = req.path.replace(/^\/+/, '').replace(/\//g, '_') || 'root';
      const reqPayload = req.body && typeof req.body === 'object' ? req.body : {};

      // 1. If in offline mode, serve immediately from Digital Twin
      if (this.offline) {
        return this.serveDigitalTwin(rawRoute, reqPayload, res, 'offline_mode');
      }

      // 2. Online Mode: Relay to Real Target Server
      const targetEndpoint = `${this.targetUrl}${req.path}`;

      try {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (k.toLowerCase() === 'host') continue;
          if (typeof v === 'string') headers[k] = v;
        }

        const forwardRes = await fetch(targetEndpoint, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(reqPayload) : undefined,
        });

        const resText = await forwardRes.text();
        let resData: any;
        try {
          resData = JSON.parse(resText);
        } catch {
          resData = resText;
        }

        // 3. Side-channel observation (Request + Response)
        if (typeof resData === 'object' && resData !== null) {
          this.recordedCount.set(rawRoute, (this.recordedCount.get(rawRoute) || 0) + 1);
          const result = await this.observer.observe(rawRoute, reqPayload, resData, 1.0);
          if (result.frozenSchema && !fs.existsSync(path.join(this.specsDir, `recorded_${rawRoute}.api.md`))) {
            this.saveRecordedSpec(result.frozenSchema);
          }
        }

        // Set response headers and send real data back
        res.status(forwardRes.status);
        res.setHeader('X-JIT-Proxy', 'recorded');
        if (typeof resData === 'object') {
          return res.json(resData);
        }
        return res.send(resData);
      } catch (err: any) {
        // Target unreachable or failed
        if (this.autoFailover) {
          console.warn(`[ProxyRecorder] Target ${targetEndpoint} unreachable: ${err.message}. Failing over to Digital Twin.`);
          return this.serveDigitalTwin(rawRoute, reqPayload, res, 'failover');
        }
        return res.status(502).json({
          error: `Bad Gateway: failed to connect to target ${targetEndpoint}`,
          details: err.message,
        });
      }
    });
  }

  /**
   * Serve response from Digital Twin (cached schema / mock)
   */
  private serveDigitalTwin(route: string, reqPayload: Record<string, unknown>, res: Response, reason: string): void {
    const frozenSchema = this.observer.getFrozenSchema(route);

    res.setHeader('X-JIT-Digital-Twin', 'true');
    res.setHeader('X-JIT-Reason', reason);

    if (frozenSchema && frozenSchema.sampleResponse) {
      res.status(200).json({
        ...frozenSchema.sampleResponse,
        _digital_twin: true,
        _reason: reason,
      });
      return;
    }

    // Fallback if not yet crystallized
    res.status(200).json({
      status: 'MOCK_DIGITAL_TWIN',
      route,
      echoPayload: reqPayload,
      _digital_twin: true,
      _reason: reason,
    });

  }

  public setOffline(offline: boolean): void {
    this.offline = offline;
  }

  public getObserver(): SchemaObserver {
    return this.observer;
  }

  public async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        const addr = this.server?.address() as any;
        const actualPort = addr?.port || this.port;
        const url = `http://localhost:${actualPort}`;
        console.log(`🛰️ JIT Smart Proxy & Digital Twin running at ${url} -> Target: ${this.targetUrl}`);
        resolve(url);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    }
  }
}
