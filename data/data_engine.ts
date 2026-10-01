/**
 * JIT Protocol Synthesis Framework - DataEngine
 * 
 * Central orchestrator for embedded database engines, external sidecars (DBX),
 * and zero-overhead pipeline execution.
 */

import {
  JITDatabaseAdapter,
  QueryOptions,
  QueryResult,
  ExecuteResult,
  AggregateOptions,
  SafeDatabaseContext,
  DataPipelineDefinition,
  TableSchema,
} from './types.js';

interface QueryCacheEntry {
  result: QueryResult;
  expiresAt: number;
}

export class DataEngine {
  private adapters = new Map<string, JITDatabaseAdapter>();
  private defaultAdapterName: string = 'default';
  private queryCache = new Map<string, QueryCacheEntry>();

  /**
   * Register a database adapter (e.g., local DuckDB, SQLite, or DBX MCP)
   */
  public registerAdapter(adapter: JITDatabaseAdapter, isDefault: boolean = false): this {
    this.adapters.set(adapter.name, adapter);
    if (isDefault || this.adapters.size === 1) {
      this.defaultAdapterName = adapter.name;
    }
    return this;
  }

  /**
   * Get an adapter by name, or fallback to the default adapter
   */
  public getAdapter(name?: string): JITDatabaseAdapter | undefined {
    const targetName = name || this.defaultAdapterName;
    return this.adapters.get(targetName);
  }

  /**
   * List all registered adapter names
   */
  public listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Execute a query against a specific adapter (or the default adapter)
   */
  public async query<T = any>(
    sql: string,
    params: any[] = [],
    adapterName?: string,
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const adapter = this.getAdapter(adapterName);
    if (!adapter) {
      throw new Error(`[DataEngine] Database adapter '${adapterName || this.defaultAdapterName}' not found`);
    }

    // Check query cache if enabled
    if (options?.useCache && options?.ttlMs) {
      const cacheKey = `${adapter.name}:${sql}:${JSON.stringify(params)}`;
      const cached = this.queryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result as QueryResult<T>;
      }
    }

    const result = await adapter.query<T>(sql, params, options);

    // Save to cache if requested
    if (options?.useCache && options?.ttlMs) {
      const cacheKey = `${adapter.name}:${sql}:${JSON.stringify(params)}`;
      this.queryCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + options.ttlMs,
      });
    }

    return result;
  }

  /**
   * Execute a mutation/DDL statement
   */
  public async execute(
    sql: string,
    params: any[] = [],
    adapterName?: string
  ): Promise<ExecuteResult> {
    const adapter = this.getAdapter(adapterName);
    if (!adapter) {
      throw new Error(`[DataEngine] Database adapter '${adapterName || this.defaultAdapterName}' not found`);
    }
    return await adapter.execute(sql, params);
  }

  /**
   * Run an aggregated OLAP query
   */
  public async aggregate(
    options: AggregateOptions,
    adapterName?: string
  ): Promise<QueryResult> {
    const adapter = this.getAdapter(adapterName);
    if (!adapter) {
      throw new Error(`[DataEngine] Database adapter '${adapterName || this.defaultAdapterName}' not found`);
    }
    if (typeof adapter.aggregate !== 'function') {
      throw new Error(`[DataEngine] Adapter '${adapter.name}' does not implement aggregate()`);
    }
    return await adapter.aggregate(options);
  }

  /**
   * Inspect schemas from an adapter
   */
  public async getSchema(adapterName?: string): Promise<TableSchema[]> {
    const adapter = this.getAdapter(adapterName);
    if (!adapter || typeof adapter.getSchema !== 'function') {
      return [];
    }
    return await adapter.getSchema();
  }

  /**
   * Creates a sandbox-safe context to inject into Node.js VM (context.db / context.dbx)
   */
  public createSafeContext(adapterName?: string): SafeDatabaseContext {
    const adapter = this.getAdapter(adapterName);
    const targetName = adapter?.name || adapterName;

    const safeCtx: SafeDatabaseContext = {
      query: async <T = any>(sql: string, params?: any[], options?: QueryOptions) => {
        return await this.query<T>(sql, params, targetName, options);
      },
      execute: async (sql: string, params?: any[]) => {
        return await this.execute(sql, params, targetName);
      },
    };

    if (adapter?.aggregate) {
      safeCtx.aggregate = async (options: AggregateOptions) => {
        return await this.aggregate(options, targetName);
      };
    }

    if (adapter?.getSchema) {
      safeCtx.getSchema = async () => {
        return await this.getSchema(targetName);
      };
    }

    return Object.setPrototypeOf(safeCtx, null);
  }

  /**
   * Run a defined data processing pipeline
   */
  public async runPipeline(
    pipeline: DataPipelineDefinition,
    params: any[] = []
  ): Promise<QueryResult> {
    const startTime = performance.now();
    const adapter = this.getAdapter(pipeline.store);
    if (!adapter) {
      throw new Error(`[DataEngine] Pipeline store '${pipeline.store}' not configured`);
    }

    if (pipeline.aggregateSql) {
      return await this.query(
        pipeline.aggregateSql,
        params,
        pipeline.store,
        {
          useCache: !!pipeline.cacheTtlMs,
          ttlMs: pipeline.cacheTtlMs,
        }
      );
    }

    return {
      rows: [],
      rowCount: 0,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Cleanly disconnect all registered adapters
   */
  public async closeAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.disconnect();
      } catch (err: any) {
        console.warn(`[DataEngine] Error disconnecting adapter ${adapter.name}:`, err.message);
      }
    }
    this.adapters.clear();
    this.queryCache.clear();
  }
}

export function createDataEngine(): DataEngine {
  return new DataEngine();
}
