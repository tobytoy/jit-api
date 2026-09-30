/**
 * JIT Model Context Protocol (MCP) Adapter
 * 
 * Automatically transforms Markdown API specifications (specs/*.api.md)
 * into native MCP Tools for Claude Desktop, Cursor, Antigravity, and AI Agents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { JITEngine } from './jit_engine.js';
import { MDLoader } from './md_loader.js';
import { ParsedMDField, ParsedMDSpec } from './md_parser.js';

function getPackageVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (data.version) return data.version;
    }
  } catch {}
  return '1.2.0';
}

export class MCPAdapter {
  /**
   * Dynamically build a Zod Schema shape from ParsedMDFields
   */
  public static buildZodShape(fields: ParsedMDField[]): Record<string, z.ZodTypeAny> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const f of fields) {
      const isOptional = f.optional || (f.description && /(?:選填|optional|\(選填\))/i.test(f.description));
      let fieldZod: z.ZodTypeAny;

      if (f.type === 'number') {
        fieldZod = z.number();
      } else if (f.type === 'boolean') {
        fieldZod = z.boolean();
      } else if (f.type === 'enum' && f.enumValues) {
        const keys = Object.keys(f.enumValues) as [string, ...string[]];
        fieldZod = keys.length > 0 ? z.enum(keys) : z.string();
      } else {
        fieldZod = z.string();
      }

      if (f.description) {
        fieldZod = fieldZod.describe(f.description);
      }

      if (isOptional) {
        fieldZod = fieldZod.optional();
      }

      shape[f.name] = fieldZod;
    }

    return shape;
  }

  /**
   * Creates an McpServer instance populated with all tools from specs/*.api.md
   */
  public static createMcpServer(
    engine: JITEngine,
    mdLoader: MDLoader,
    stageFilter: 'all' | 'prod' | 'dev' = 'all'
  ): McpServer {
    const mcpServer = new McpServer({
      name: 'jit-api-mcp',
      version: getPackageVersion(),
    });

    const specs = mdLoader.loadAll(engine, stageFilter);

    for (const spec of specs) {
      const shape = this.buildZodShape(spec.fields);
      const desc = `${spec.description || spec.route}. (Intent: ${spec.intentCriteria})`;

      mcpServer.tool(spec.route, desc, shape, async (args: any) => {
        try {
          const result = await engine.execute({
            route: spec.route,
            ...args,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.data, null, 2),
              },
            ],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Error executing tool ${spec.route}: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
      });
    }

    return mcpServer;
  }

  /**
   * Mounts MCP SSE transport endpoints to an Express app (/sse and /messages)
   */
  public static attachToExpress(
    app: Express,
    engine: JITEngine,
    mdLoader: MDLoader,
    ssePath: string = '/sse',
    messagePath: string = '/messages',
    isProd: boolean = false,
    port: number = 3005,
    stageFilter: 'all' | 'prod' | 'dev' = 'all'
  ): void {
    const transports = new Map<string, SSEServerTransport>();
    const mcpServer = this.createMcpServer(engine, mdLoader, stageFilter);

    // Watch specs directory to update engine in background only in dev mode
    if (!isProd) {
      mdLoader.watch(engine, undefined, stageFilter);
    }

    // SSE connection endpoint
    app.get(ssePath, async (req: Request, res: Response) => {
      const transport = new SSEServerTransport(messagePath, res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      transport.onclose = () => {
        transports.delete(sessionId);
      };
      await mcpServer.connect(transport);
    });

    // Message handler endpoint
    app.post(messagePath, async (req: Request, res: Response) => {
      const sessionId = (req.query.sessionId as string) || (req.body?.sessionId as string);
      const transport = sessionId
        ? transports.get(sessionId)
        : transports.size === 1
        ? transports.values().next().value
        : null;

      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send(`No active MCP SSE session${sessionId ? ` for sessionId: ${sessionId}` : ''}`);
      }
    });

    console.log(`🤖 MCP Server (Model Context Protocol) 已掛載:`);
    console.log(`   - SSE 連線入口: http://localhost:${port}${ssePath}`);
    console.log(`   - 訊息接收入口: http://localhost:${port}${messagePath}`);
  }

  /**
   * Create a Web Standard (Fetch API compatible) request handler for MCP
   * Compatible with Cloudflare Workers, Hono, Bun, and Deno
   */
  public static createWebStandardHandler(
    engine: JITEngine,
    mdLoader: MDLoader,
    options?: {
      stageFilter?: 'all' | 'prod' | 'dev';
      keepAliveMs?: number;
      enableJsonResponse?: boolean;
    }
  ): (request: globalThis.Request | { raw: globalThis.Request }) => Promise<globalThis.Response> {
    const stageFilter = options?.stageFilter || 'all';
    const keepAliveMs = options?.keepAliveMs ?? 0;
    const enableJsonResponse = options?.enableJsonResponse ?? true;

    return async (req: globalThis.Request | { raw: globalThis.Request }) => {
      const mcpServer = MCPAdapter.createMcpServer(engine, mdLoader, stageFilter);
      const transport = new WebStandardStreamableHTTPServerTransport({
        keepAliveMs,
        enableJsonResponse,
      });
      await mcpServer.connect(transport);
      const rawReq = 'raw' in req && req.raw instanceof Request ? req.raw : (req as globalThis.Request);
      return await transport.handleRequest(rawReq);
    };
  }

  /**
   * Attach MCP protocol endpoints (/mcp, /sse, /messages) directly to a Hono application
   */
  public static attachToHono(
    app: any,
    engine: JITEngine,
    mdLoader: MDLoader,
    options?: {
      mcpPath?: string;
      ssePath?: string;
      messagePath?: string;
      stageFilter?: 'all' | 'prod' | 'dev';
      authMiddleware?: any;
    }
  ): void {
    const mcpPath = options?.mcpPath || '/mcp';
    const ssePath = options?.ssePath || '/sse';
    const messagePath = options?.messagePath || '/message';
    const stageFilter = options?.stageFilter || 'all';
    const handler = this.createWebStandardHandler(engine, mdLoader, { stageFilter });

    const handleRoute = async (c: any) => {
      try {
        return await handler(c.req?.raw || c.req);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json(
          { jsonrpc: '2.0', error: { code: -32603, message }, id: null },
          500
        );
      }
    };

    if (options?.authMiddleware) {
      app.use(mcpPath, options.authMiddleware);
      app.use(ssePath, options.authMiddleware);
      app.use(messagePath, options.authMiddleware);
    }

    app.get(mcpPath, handleRoute);
    app.post(mcpPath, handleRoute);
    app.delete(mcpPath, handleRoute);
    app.get(ssePath, handleRoute);
    app.post(ssePath, handleRoute);
    app.post(messagePath, handleRoute);
  }
  /**
   * Start MCP server over standard I/O (for Claude Desktop / Cursor CLI)
   */
  public static async startStdio(
    engine: JITEngine,
    mdLoader: MDLoader,
    stageFilter: 'all' | 'prod' | 'dev' = 'all'
  ): Promise<void> {
    const mcpServer = this.createMcpServer(engine, mdLoader, stageFilter);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  }
}
