import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import { ConnectAdapter } from './connect_adapter.js';
import { JITEngine } from './jit_engine.js';
import { MDLoader } from './md_loader.js';
import { MDParser } from './md_parser.js';
import { RouteDefinition } from './types.js';

export interface MockServerOptions {
  port?: number;
  specsDir?: string;
  stabilityThreshold?: number; // default: 3
  persistence?: boolean;
}

export class MockServer {
  private app: Express;
  private server?: http.Server;
  private engine: JITEngine;
  private mdLoader?: MDLoader;
  private port: number;

  constructor(options?: MockServerOptions) {
    this.port = options?.port ?? 3005;
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.raw({ type: ['application/connect+proto', 'application/proto'], limit: '10mb' }));

    this.engine = new JITEngine({
      stabilityThreshold: options?.stabilityThreshold ?? 3,
      driftMode: 'evolve',
      persistence: options?.persistence ?? false,
    });

    if (options?.specsDir) {
      this.mdLoader = new MDLoader(options.specsDir);
      this.loadSpecsAsMocks();
    }

    this.setupRoutes();
  }

  /**
   * Load Markdown specs and transform them into intelligent Mock route handlers
   */
  private loadSpecsAsMocks(): void {
    if (!this.mdLoader) return;
    const specInfos = this.mdLoader.listSpecs('all');

    for (const info of specInfos) {
      try {
        const content = fs.readFileSync(info.path, 'utf-8');
        const parsed = MDParser.parse(content, info.filename);

        const routeDef: RouteDefinition = {
          route: parsed.route,
          description: parsed.description,
          intentCriteria: parsed.intentCriteria,
          version: parsed.version,
          samplePayload: parsed.samplePayload,
          auth: parsed.auth,
          handler: async (payload, ctx) => {
            // 1. If explicit mockResponse was defined in spec
            if (parsed.mockResponse !== undefined) {
              return typeof parsed.mockResponse === 'object' && parsed.mockResponse !== null
                ? { ...parsed.mockResponse, _mock: true }
                : parsed.mockResponse;
            }

            // 2. Synthesize realistic mock response from sample or fields
            const mockData = parsed.samplePayload
              ? { ...parsed.samplePayload, status: 'MOCK_SUCCESS', _mock: true }
              : {
                  status: 'MOCK_SUCCESS',
                  route: parsed.route,
                  timestamp: new Date().toISOString(),
                  _mock: true,
                };

            return mockData;
          },
        };

        this.engine.register(routeDef);
      } catch (err: any) {
        console.warn(`[MockServer] Error parsing spec ${info.filename}:`, err.message);
      }
    }
  }

  /**
   * Register a custom mock route directly
   */
  public registerMock(route: string, mockResponseOrHandler: any): this {
    const handler =
      typeof mockResponseOrHandler === 'function'
        ? mockResponseOrHandler
        : async () => ({ ...mockResponseOrHandler, _mock: true });

    this.engine.register({
      route,
      description: `Mock route for ${route}`,
      intentCriteria: `Mock ${route}`,
      handler,
    });

    return this;
  }

  private setupRoutes(): void {
    // Attach ConnectRPC endpoints (Triple Protocol: Connect, gRPC-Web, gRPC)
    ConnectAdapter.attachToExpress(this.app, this.engine, this.mdLoader, {
      port: this.port,
    });

    // Mock Info / Discovery endpoint
    this.app.get('/api/mock', (req: Request, res: Response) => {
      const routes = this.engine.getRoutes().map((r) => {
        const isFrozen = this.engine.getObserver().isFrozen(r.route);
        return {
          route: r.route,
          description: r.description,
          phase: isFrozen ? 'phase3_frozen' : 'phase1_dynamic',
          isFrozen,
        };
      });

      res.json({
        server: 'JIT-API Smart Mock Server',
        port: this.port,
        protocol: 'HTTP REST / ConnectRPC v1',
        totalMocks: routes.length,
        mocks: routes,
      });
    });

    // REST Mock Dispatch Endpoint: POST /api/mock/:route
    this.app.post('/api/mock/:route', async (req: Request, res: Response) => {
      const rawRoute = req.params.route;
      const route = Array.isArray(rawRoute) ? rawRoute[0] : rawRoute;
      try {
        const payload = req.body || {};
        const result = await this.engine.execute(payload, route, req.headers as Record<string, string>);
        return res.status(200).json({
          success: result.success,
          data: result.data,
          context: result.context,
        });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });
  }

  public getApp(): Express {
    return this.app;
  }

  public getEngine(): JITEngine {
    return this.engine;
  }

  public async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        const addr = this.server?.address() as any;
        const actualPort = addr?.port || this.port;
        const url = `http://localhost:${actualPort}`;
        console.log(`🎭 JIT Smart Mock Server running at ${url}`);
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
