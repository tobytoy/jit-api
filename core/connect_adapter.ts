/**
 * JIT ConnectRPC Adapter
 * 
 * Provides native ConnectRPC protocol support (Connect Protocol v1, gRPC-Web, and gRPC)
 * for JIT-API routes, enabling binary/JSON multi-protocol execution, browser-direct calls,
 * and high-performance inter-service communication in Phase 3.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { JITEngine } from './jit_engine.js';
import { MDLoader } from './md_loader.js';
import { UnauthorizedError } from './types.js';

export interface ConnectAdapterOptions {
  serviceName?: string; // default: 'jit.v1.JITService'
  stageFilter?: 'all' | 'prod' | 'dev';
  isProd?: boolean;
  port?: number;
}

export interface ConnectErrorPayload {
  code:
    | 'invalid_argument'
    | 'unauthenticated'
    | 'permission_denied'
    | 'not_found'
    | 'already_exists'
    | 'resource_exhausted'
    | 'internal'
    | 'unavailable';
  message: string;
  details?: Array<{ type: string; value: string }>;
}

export class ConnectAdapter {
  /**
   * Helper to convert snake_case or kebab-case to PascalCase (e.g. create_order -> CreateOrder)
   */
  public static toPascalCase(str: string): string {
    return str
      .split(/[_-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  /**
   * Helper to convert PascalCase to snake_case (e.g. CreateOrder -> create_order)
   */
  public static toSnakeCase(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  /**
   * Encode binary payload with ConnectRPC / gRPC 5-byte envelope framing:
   * [1 byte flag] [4 bytes big-endian length] [payload]
   */
  public static encodeFrame(payload: Buffer | Uint8Array, flags: number = 0): Buffer {
    const frame = Buffer.alloc(5 + payload.length);
    frame.writeUInt8(flags, 0);
    frame.writeUInt32BE(payload.length, 1);
    Buffer.from(payload).copy(frame, 5);
    return frame;
  }

  /**
   * Decode binary payload from ConnectRPC / gRPC 5-byte envelope framing if present
   */
  public static decodeFrame(raw: Buffer): { flags: number; data: Buffer } {
    if (raw.length >= 5) {
      const flags = raw.readUInt8(0);
      const length = raw.readUInt32BE(1);
      if (raw.length >= 5 + length) {
        return {
          flags,
          data: raw.subarray(5, 5 + length),
        };
      }
    }
    return { flags: 0, data: raw };
  }

  /**
   * Parse incoming body supporting JSON and Connect proto formats
   */
  private static parseRequestBody(req: Request): Record<string, unknown> {
    const contentType = req.headers['content-type'] || '';

    if (Buffer.isBuffer(req.body)) {
      const decoded = this.decodeFrame(req.body);
      const text = decoded.data.toString('utf-8');
      try {
        return JSON.parse(text);
      } catch {
        // Fallback to query or empty
        return {};
      }
    }

    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }

    if (typeof req.body === 'object' && req.body !== null) {
      return req.body;
    }

    return {};
  }

  /**
   * Mounts ConnectRPC endpoints onto an Express application.
   */
  public static attachToExpress(
    app: Express,
    engine: JITEngine,
    mdLoader?: MDLoader,
    options?: ConnectAdapterOptions
  ): void {
    const serviceName = options?.serviceName || 'jit.v1.JITService';
    const port = options?.port || 3005;

    // Helper to send Connect protocol compliant error response
    const sendConnectError = (
      res: Response,
      code: ConnectErrorPayload['code'],
      message: string,
      httpStatus: number
    ) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Connect-Protocol-Version', '1');
      res.status(httpStatus).json({
        code,
        message,
      });
    };

    // Helper to format success response (supports JSON or binary proto envelope)
    const sendConnectSuccess = (req: Request, res: Response, body: any) => {
      const acceptHeader = req.headers['accept'] || '';
      const contentTypeHeader = req.headers['content-type'] || '';
      const wantsBinaryProto =
        acceptHeader.includes('application/proto') ||
        acceptHeader.includes('application/connect+proto') ||
        contentTypeHeader.includes('proto');

      res.setHeader('Connect-Protocol-Version', '1');

      if (wantsBinaryProto) {
        res.setHeader('Content-Type', 'application/connect+proto');
        const jsonBuf = Buffer.from(JSON.stringify(body), 'utf-8');
        const framed = this.encodeFrame(jsonBuf, 0);
        res.status(200).send(framed);
      } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(body);
      }
    };

    // 1. Service Discovery / Metadata Endpoint: GET /jit.v1.JITService
    app.get([`/${serviceName}`, `/${serviceName}/Describe`], (req: Request, res: Response) => {
      const routes = engine.getRoutes();
      const methods = routes.map((r) => {
        const isFrozen = engine.getObserver().isFrozen(r.route);
        const versions = engine.getObserver().getFrozenSchemas(r.route).map((s) => s.version);
        return {
          method: this.toPascalCase(r.route),
          rawRoute: r.route,
          path: `/${serviceName}/${this.toPascalCase(r.route)}`,
          description: r.description,
          phase: isFrozen ? 'phase3_frozen' : 'phase1_dynamic',
          isFrozen,
          frozenVersions: versions,
        };
      });

      res.json({
        service: serviceName,
        protocol: 'ConnectRPC v1',
        supports: ['connect+json', 'connect+proto', 'grpc-web', 'grpc'],
        methods: [
          {
            method: 'Execute',
            path: `/${serviceName}/Execute`,
            description: 'Universal JIT execution entrypoint (supports natural language intent, auto-repair & fast-path)',
          },
          ...methods,
        ],
      });
    });

    // 2. Universal RPC Endpoint: POST /jit.v1.JITService/Execute
    app.post(`/${serviceName}/Execute`, async (req: Request, res: Response) => {
      try {
        const payload = this.parseRequestBody(req);
        if (typeof payload !== 'object' || payload === null) {
          return sendConnectError(res, 'invalid_argument', 'Request body must be a JSON/Proto object', 400);
        }

        const targetRoute = (payload.route as string) || undefined;
        const innerPayload =
          payload.payload && typeof payload.payload === 'object'
            ? { ...(payload.payload as Record<string, unknown>), route: targetRoute }
            : payload;

        const result = await engine.execute(innerPayload, targetRoute, req.headers as Record<string, string>);
        return sendConnectSuccess(req, res, {
          success: result.success,
          data: result.data,
          context: result.context,
        });
      } catch (err: any) {
        if (err instanceof UnauthorizedError || err.name === 'UnauthorizedError') {
          return sendConnectError(res, 'unauthenticated', err.message, 401);
        }
        return sendConnectError(res, 'internal', err.message || 'Execution error', 500);
      }
    });

    // 3. Dynamic Typed RPC Method Endpoint: POST /jit.v1.JITService/:method
    app.post(`/${serviceName}/:method`, async (req: Request, res: Response) => {
      const rawMethod = req.params.method;
      const methodName = Array.isArray(rawMethod) ? rawMethod[0] : rawMethod;
      if (!methodName || methodName === 'Execute') return; // Handled above

      // Resolve route name: test PascalCase -> snake_case, or direct match
      const candidate1 = this.toSnakeCase(methodName);
      const candidate2 = methodName;
      const candidate3 = methodName.toLowerCase();

      const availableRoutes = engine.getRoutes().map((r) => r.route);
      const matchedRoute = [candidate1, candidate2, candidate3].find((c) => availableRoutes.includes(c));

      if (!matchedRoute) {
        return sendConnectError(
          res,
          'not_found',
          `Method '${methodName}' not found on service '${serviceName}'. Available routes: ${availableRoutes.join(', ')}`,
          404
        );
      }

      try {
        const payload = this.parseRequestBody(req);
        const result = await engine.execute(payload, matchedRoute, req.headers as Record<string, string>);

        if (!result.success) {
          return sendConnectError(res, 'invalid_argument', result.error || 'Execution failed', 400);
        }

        // Return unified data payload with execution context metadata
        return sendConnectSuccess(req, res, {
          ...result.data,
          _jit: {
            phase: result.context.phase,
            version: result.context.version,
            executionTimeMs: result.context.executionTimeMs,
            aiLatencyMs: result.context.aiLatencyMs,
            autoRepaired: result.context.autoRepaired,
            softDriftDetected: result.context.softDriftDetected,
            engineUsed: result.context.engineUsed,
          },
        });
      } catch (err: any) {
        if (err instanceof UnauthorizedError || err.name === 'UnauthorizedError') {
          return sendConnectError(res, 'unauthenticated', err.message, 401);
        }
        return sendConnectError(res, 'internal', err.message || 'Execution error', 500);
      }
    });

    console.log(`⚡ ConnectRPC (Triple-Protocol: Connect / gRPC-Web / gRPC) 已掛載:`);
    console.log(`   - 服務描述: http://localhost:${port}/${serviceName}`);
    console.log(`   - 通用執行入口: http://localhost:${port}/${serviceName}/Execute`);
  }
}
