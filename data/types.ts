/**
 * JIT Protocol Synthesis Framework - Data & Database Abstraction Types
 * 
 * Defines standard interfaces for embedded OLAP engines (DuckDB),
 * relational storage (SQLite/Postgres), and external sidecar proxies (DBX MCP).
 */

export interface QueryOptions {
  timeoutMs?: number;
  maxRows?: number;
  useCache?: boolean;
  ttlMs?: number;
  transaction?: boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  durationMs: number;
  columns?: Array<{ name: string; type?: string }>;
}

export interface ExecuteResult {
  affectedRows: number;
  lastInsertId?: string | number;
  durationMs: number;
}

export type MetricAggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface AggregateOptions {
  table: string;
  dimensions?: string[];
  metrics: Record<string, MetricAggregationType>;
  where?: Record<string, any>;
  timeRange?: { column: string; start: string; end: string };
  limit?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface TableColumn {
  name: string;
  type: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: any;
}

export interface TableSchema {
  tableName: string;
  columns: TableColumn[];
  database?: string;
}

export interface JITDatabaseAdapter {
  name: string;
  type: 'embedded' | 'remote' | 'sidecar';

  // Core execution
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[]): Promise<ExecuteResult>;

  // High-performance OLAP aggregation
  aggregate?(options: AggregateOptions): Promise<QueryResult>;

  // Schema introspection
  getSchema?(): Promise<TableSchema[]>;

  // Health and liveness
  ping?(): Promise<boolean>;
}

export interface DataPipelineDefinition {
  name: string;
  store: string;
  source?: string;
  transformCode?: string;
  aggregateSql?: string;
  cacheTtlMs?: number;
}

export interface DataStoreConfig {
  name: string;
  provider: 'local_duckdb' | 'sqlite' | 'dbx' | string;
  target?: string;
  tunnel?: string;
  options?: Record<string, any>;
}

/**
 * Lightweight safe context passed to VM sandbox (context.db / context.dbx)
 */
export interface SafeDatabaseContext {
  query: <T = any>(sql: string, params?: any[], options?: QueryOptions) => Promise<QueryResult<T>>;
  execute: (sql: string, params?: any[]) => Promise<ExecuteResult>;
  aggregate?: (options: AggregateOptions) => Promise<QueryResult>;
  getSchema?: () => Promise<TableSchema[]>;
}
