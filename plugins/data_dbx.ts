/**
 * JIT Protocol Synthesis Framework - DBX MCP Database Plugin
 * 
 * Bridges JIT-API to 100+ databases through DBX's Model Context Protocol (MCP) Server.
 * Supports Stdio, SSE, and Mock fallback for testing and offline environments.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  JITDatabaseAdapter,
  QueryOptions,
  QueryResult,
  ExecuteResult,
  TableSchema,
} from '../data/types.js';
import { JITPlugin, JITPluginContext } from '../core/plugin.js';

export interface DBXMCPPluginOptions {
  name?: string;
  mode?: 'stdio' | 'sse' | 'mock';
  command?: string;
  args?: string[];
  sseUrl?: string;
  connectionName?: string;
}

export class DBXMCPAdapter implements JITDatabaseAdapter {
  public name: string;
  public type: 'sidecar' = 'sidecar';
  private mode: 'stdio' | 'sse' | 'mock';
  private client: Client | null = null;
  private transport: any = null;
  private isConnected: boolean = false;
  private options: DBXMCPPluginOptions;

  constructor(options: DBXMCPPluginOptions = {}) {
    this.name = options.name || 'dbx';
    this.mode = options.mode || 'mock';
    this.options = options;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.mode === 'mock') {
      this.isConnected = true;
      return;
    }

    try {
      this.client = new Client(
        {
          name: 'jit-api-dbx-bridge',
          version: '1.5.0',
        },
        {
          capabilities: {},
        }
      );

      if (this.mode === 'stdio') {
        const cmd = this.options.command || 'dbx';
        const args = this.options.args || ['mcp'];
        this.transport = new StdioClientTransport({
          command: cmd,
          args,
        });
      } else if (this.mode === 'sse' && this.options.sseUrl) {
        this.transport = new SSEClientTransport(new URL(this.options.sseUrl));
      }

      if (this.transport) {
        await this.client.connect(this.transport);
        this.isConnected = true;
      }
    } catch (err: any) {
      console.warn(`[DBX-MCP] Failed to connect to DBX via ${this.mode}: ${err.message}. Falling back to mock.`);
      this.mode = 'mock';
      this.isConnected = true;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.transport && typeof this.transport.close === 'function') {
      try {
        await this.transport.close();
      } catch {}
    }
    this.client = null;
    this.transport = null;
    this.isConnected = false;
  }

  public async ping(): Promise<boolean> {
    return this.isConnected;
  }

  public async query<T = any>(
    sql: string,
    params: any[] = [],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const startTime = performance.now();
    if (!this.isConnected) await this.connect();

    if (this.client && this.mode !== 'mock') {
      try {
        const res = await this.client.callTool({
          name: 'execute_sql',
          arguments: {
            connection: this.options.connectionName || 'default',
            sql,
            params,
          },
        });

        // Parse tool result
        const content = res.content;
        let rows: any[] = [];
        if (Array.isArray(content) && content.length > 0 && content[0].text) {
          try {
            rows = JSON.parse(content[0].text);
          } catch {
            rows = [{ result: content[0].text }];
          }
        }

        return {
          rows: rows as T[],
          rowCount: rows.length,
          durationMs: performance.now() - startTime,
        };
      } catch (err: any) {
        throw new Error(`[DBX-MCP Error] ${err.message}`);
      }
    }

    // Mock response for testing or offline environments
    return {
      rows: [] as T[],
      rowCount: 0,
      durationMs: performance.now() - startTime,
    };
  }

  public async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    const startTime = performance.now();
    if (!this.isConnected) await this.connect();

    if (this.client && this.mode !== 'mock') {
      await this.client.callTool({
        name: 'execute_sql',
        arguments: {
          connection: this.options.connectionName || 'default',
          sql,
          params,
        },
      });
    }

    return {
      affectedRows: 1,
      durationMs: performance.now() - startTime,
    };
  }

  public async getSchema(): Promise<TableSchema[]> {
    if (!this.isConnected) await this.connect();

    if (this.client && this.mode !== 'mock') {
      try {
        const res = await this.client.callTool({
          name: 'list_tables',
          arguments: {
            connection: this.options.connectionName || 'default',
          },
        });
        const content = res.content;
        if (Array.isArray(content) && content.length > 0 && content[0].text) {
          return JSON.parse(content[0].text);
        }
      } catch (err: any) {
        console.warn(`[DBX-MCP] Schema reflection failed: ${err.message}`);
      }
    }

    return [];
  }
}

/**
 * Creates a JIT plugin wrapper that registers DBX as a database adapter
 */
export function createDBXPlugin(options: DBXMCPPluginOptions = {}): JITPlugin & { adapter: DBXMCPAdapter } {
  const adapter = new DBXMCPAdapter(options);

  return {
    name: 'data-dbx',
    version: '1.5.0',
    description: 'Bridges JIT-API to 100+ databases via DBX Model Context Protocol (MCP)',
    adapter,
    async onInit(context: JITPluginContext) {
      if (context.engine && typeof context.engine.registerDatabaseAdapter === 'function') {
        context.engine.registerDatabaseAdapter(adapter);
      }
    },
  };
}
