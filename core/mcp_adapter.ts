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
      if (f.type === 'number') {
        shape[f.name] = z.number().describe(f.description || f.name);
      } else if (f.type === 'boolean') {
        shape[f.name] = z.boolean().describe(f.description || f.name);
      } else if (f.type === 'enum' && f.enumValues) {
        const keys = Object.keys(f.enumValues) as [string, ...string[]];
        shape[f.name] = (keys.length > 0 ? z.enum(keys) : z.string()).describe(f.description || f.name);
      } else {
        shape[f.name] = z.string().describe(f.description || f.name);
      }
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
