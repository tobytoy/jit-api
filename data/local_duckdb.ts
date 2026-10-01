/**
 * JIT Protocol Synthesis Framework - Local DuckDB & Embedded Analytical Adapter
 * 
 * Provides zero-config, ultra-fast embedded OLAP analysis.
 * Automatically uses native DuckDB when available, with a built-in
 * zero-dependency in-memory vectorized SQL fallback.
 */

import {
  JITDatabaseAdapter,
  QueryOptions,
  QueryResult,
  ExecuteResult,
  AggregateOptions,
  TableSchema,
  TableColumn,
} from './types.js';

export interface LocalDuckDBOptions {
  databasePath?: string; // ':memory:' or file path
  name?: string;
}

/**
 * Validate and quote SQL identifier to prevent SQL injection in DDL and query builders
 */
function sanitizeIdentifier(name: string): string {
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export class LocalDuckDBAdapter implements JITDatabaseAdapter {
  public name: string;
  public type: 'embedded' = 'embedded';
  private databasePath: string;
  private nativeInstance: any = null;
  private isConnected: boolean = false;

  // In-memory fallback storage
  private memoryTables = new Map<string, Array<Record<string, any>>>();
  private tableSchemas = new Map<string, TableColumn[]>();

  constructor(options: LocalDuckDBOptions = {}) {
    this.name = options.name || 'local_duckdb';
    this.databasePath = options.databasePath || ':memory:';
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    // Dynamically attempt to import native DuckDB if installed
    try {
      // Dynamic import to avoid static bundling failures
      const duckdbModule = await import('duckdb' as any);
      const duckdb = duckdbModule.default || duckdbModule;
      this.nativeInstance = new duckdb.Database(this.databasePath);
      this.isConnected = true;
    } catch {
      // Graceful fallback to pure in-memory SQL simulator
      this.nativeInstance = null;
      this.isConnected = true;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.nativeInstance && typeof this.nativeInstance.close === 'function') {
      await new Promise<void>((resolve) => this.nativeInstance.close(() => resolve()));
    }
    this.nativeInstance = null;
    this.memoryTables.clear();
    this.tableSchemas.clear();
    this.isConnected = false;
  }

  public async ping(): Promise<boolean> {
    return this.isConnected;
  }

  /**
   * Helper to seed/insert rows into an in-memory table
   */
  public async insertRows(tableName: string, rows: Array<Record<string, any>>): Promise<void> {
    if (!this.isConnected) await this.connect();

    const safeTable = sanitizeIdentifier(tableName);

    if (this.nativeInstance) {
      // If native duckdb is active
      const rawColumns = Object.keys(rows[0] || {});
      const safeColumns = rawColumns.map(c => sanitizeIdentifier(c));
      if (rawColumns.length > 0) {
        const createTableSql = `CREATE TABLE IF NOT EXISTS ${safeTable} (${safeColumns.map(c => `${c} VARCHAR`).join(', ')})`;
        await this.execute(createTableSql);
        for (const row of rows) {
          const values = rawColumns.map(c => `'${String(row[c] ?? '').replace(/'/g, "''")}'`).join(', ');
          await this.execute(`INSERT INTO ${safeTable} VALUES (${values})`);
        }
      }
      return;
    }

    // In-memory fallback
    const existing = this.memoryTables.get(tableName) || [];
    this.memoryTables.set(tableName, existing.concat(rows));

    // Auto-detect columns
    if (rows.length > 0 && !this.tableSchemas.has(tableName)) {
      const sample = rows[0];
      const cols: TableColumn[] = Object.keys(sample).map(key => ({
        name: key,
        type: typeof sample[key] === 'number' ? 'DOUBLE' : 'VARCHAR',
      }));
      this.tableSchemas.set(tableName, cols);
    }
  }

  public async query<T = any>(
    sql: string,
    params: any[] = [],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const startTime = performance.now();
    if (!this.isConnected) await this.connect();

    if (this.nativeInstance) {
      return await new Promise<QueryResult<T>>((resolve, reject) => {
        const conn = this.nativeInstance.connect();
        conn.all(sql, ...params, (err: any, rows: any[]) => {
          if (err) return reject(err);
          resolve({
            rows: (rows || []) as T[],
            rowCount: rows ? rows.length : 0,
            durationMs: performance.now() - startTime,
          });
        });
      });
    }

    // Pure JS In-Memory SQL Evaluator Fallback
    const rows = this.evaluateMemorySql(sql, params);
    const durationMs = performance.now() - startTime;

    let finalRows = rows;
    if (options?.maxRows && finalRows.length > options.maxRows) {
      finalRows = finalRows.slice(0, options.maxRows);
    }

    return {
      rows: finalRows as T[],
      rowCount: finalRows.length,
      durationMs,
    };
  }

  public async execute(sql: string, params: any[] = []): Promise<ExecuteResult> {
    const startTime = performance.now();
    if (!this.isConnected) await this.connect();

    if (this.nativeInstance) {
      return await new Promise<ExecuteResult>((resolve, reject) => {
        const conn = this.nativeInstance.connect();
        conn.run(sql, ...params, function (this: any, err: any) {
          if (err) return reject(err);
          resolve({
            affectedRows: this?.changes || 0,
            durationMs: performance.now() - startTime,
          });
        });
      });
    }

    // Basic DDL in memory fallback
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('CREATE TABLE')) {
      const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
      if (match) {
        const tableName = match[1];
        if (!this.memoryTables.has(tableName)) {
          this.memoryTables.set(tableName, []);
        }
      }
    } else if (trimmed.startsWith('DROP TABLE')) {
      const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
      if (match) {
        this.memoryTables.delete(match[1]);
        this.tableSchemas.delete(match[1]);
      }
    } else if (trimmed.startsWith('INSERT INTO')) {
      const match = sql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const colsRaw = match[2];
        const valsRaw = match[3];

        const existing = this.memoryTables.get(tableName) || [];
        const cols = colsRaw ? colsRaw.split(',').map(c => c.trim().replace(/["`]/g, '')) : [];
        const rawVals = valsRaw.split(',').map(v => v.trim());

        let paramIdx = 0;
        const newRow: Record<string, any> = {};

        rawVals.forEach((valStr, i) => {
          let val: any;
          if (valStr === '?') {
            val = params[paramIdx++];
          } else if ((valStr.startsWith("'") && valStr.endsWith("'")) || (valStr.startsWith('"') && valStr.endsWith('"'))) {
            val = valStr.slice(1, -1);
          } else if (!isNaN(Number(valStr))) {
            val = Number(valStr);
          } else {
            val = valStr;
          }

          const colName = cols[i] || `col_${i}`;
          newRow[colName] = val;
        });

        existing.push(newRow);
        this.memoryTables.set(tableName, existing);
        return {
          affectedRows: 1,
          durationMs: performance.now() - startTime,
        };
      }
    }

    return {
      affectedRows: 1,
      durationMs: performance.now() - startTime,
    };
  }

  public async aggregate(options: AggregateOptions): Promise<QueryResult> {
    const startTime = performance.now();
    const { table, dimensions = [], metrics, where, limit, orderBy, orderDirection = 'DESC' } = options;

    const safeTable = sanitizeIdentifier(table);

    // Generate vectorized SQL
    const selectParts: string[] = [];
    dimensions.forEach(dim => selectParts.push(sanitizeIdentifier(dim)));

    Object.entries(metrics).forEach(([col, agg]) => {
      const fn = agg.toUpperCase();
      const safeCol = sanitizeIdentifier(col);
      const safeAlias = sanitizeIdentifier(`${agg}_${col}`);
      selectParts.push(`${fn}(${safeCol}) AS ${safeAlias}`);
    });

    let sql = `SELECT ${selectParts.join(', ')} FROM ${safeTable}`;
    const params: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.entries(where).map(([k, v]) => {
        const safeCol = sanitizeIdentifier(k);
        params.push(v);
        return `${safeCol} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (dimensions.length > 0) {
      sql += ` GROUP BY ${dimensions.map(d => sanitizeIdentifier(d)).join(', ')}`;
    }

    if (orderBy) {
      const safeOrder = sanitizeIdentifier(orderBy);
      const safeDir = orderDirection === 'ASC' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${safeOrder} ${safeDir}`;
    }

    if (limit) {
      sql += ` LIMIT ${Number(limit)}`;
    }

    return await this.query(sql, params);
  }

  public async getSchema(): Promise<TableSchema[]> {
    if (!this.isConnected) await this.connect();

    if (this.nativeInstance) {
      const res = await this.query<{ table_name: string; column_name: string; data_type: string }>(
        "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'main'"
      );
      const tableMap = new Map<string, TableColumn[]>();
      for (const row of res.rows) {
        const cols = tableMap.get(row.table_name) || [];
        cols.push({ name: row.column_name, type: row.data_type });
        tableMap.set(row.table_name, cols);
      }
      return Array.from(tableMap.entries()).map(([tableName, columns]) => ({
        tableName,
        columns,
      }));
    }

    // In-memory schema
    return Array.from(this.memoryTables.keys()).map(tableName => ({
      tableName,
      columns: this.tableSchemas.get(tableName) || [],
    }));
  }

  /**
   * Simple pure JS in-memory query evaluator for zero-dependency test/fallback
   */
  private evaluateMemorySql(sql: string, params: any[]): any[] {
    const fromMatch = sql.match(/FROM\s+["']?([a-zA-Z0-9_]+)["']?/i);
    if (!fromMatch) return [];

    const tableName = fromMatch[1];
    let rows = (this.memoryTables.get(tableName) || []).map(r => ({ ...r }));

    // WHERE matching (supports single or AND-chained conditions with parameterized ?)
    const whereMatch = sql.match(/WHERE\s+((?:(?!\bGROUP\b|\bORDER\b|\bLIMIT\b)[^;])+)/i);
    if (whereMatch) {
      const condStr = whereMatch[1].trim();
      const parts = condStr.split(/\s+AND\s+/i);
      let paramIdx = 0;
      for (const part of parts) {
        const eqMatch = part.trim().match(/"?([a-zA-Z0-9_]+)"?\s*=\s*(?:'([^']*)'|"([^"]*)"|(\S+))/);
        if (eqMatch) {
          const col = eqMatch[1];
          let val = eqMatch[2] !== undefined ? eqMatch[2] : (eqMatch[3] !== undefined ? eqMatch[3] : eqMatch[4]);
          if (val === '?' && params && paramIdx < params.length) {
            val = String(params[paramIdx++]);
          }
          rows = rows.filter(r => String(r[col]) === val);
        }
      }
    }

    // Check for aggregate functions: SUM(col), AVG(col), COUNT(*), COUNT(col)
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const selectClause = selectMatch[1].trim();

      // Check if SELECT is a simple COUNT(*) without GROUP BY
      const hasGroupBy = /GROUP\s+BY/i.test(sql);
      if (!hasGroupBy && /^\s*COUNT\(\*\)\s*(?:AS\s+["']?([a-zA-Z0-9_]+)["']?)?\s*$/i.test(selectClause)) {
        return [{ count: rows.length }];
      }

      // Group By support
      const groupMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:ORDER|LIMIT|;|$)/i);
      if (groupMatch) {
        const groupCols = groupMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        const groups = new Map<string, any[]>();

        for (const row of rows) {
          const key = groupCols.map(c => String(row[c])).join(':::');
          const group = groups.get(key) || [];
          group.push(row);
          groups.set(key, group);
        }

        const aggregatedRows: any[] = [];
        for (const [key, groupRows] of groups.entries()) {
          const aggRow: Record<string, any> = {};
          groupCols.forEach((col, idx) => {
            aggRow[col] = key.split(':::')[idx];
          });

          // Compute metrics
          const sumMatches = Array.from(selectClause.matchAll(/SUM\(["']?([a-zA-Z0-9_]+)["']?\)\s*(?:AS\s+["']?([a-zA-Z0-9_]+)["']?)?/gi));
          for (const m of sumMatches) {
            const col = m[1];
            const alias = m[2] || `sum_${col}`;
            aggRow[alias] = groupRows.reduce((acc, r) => acc + Number(r[col] || 0), 0);
          }

          const avgMatches = Array.from(selectClause.matchAll(/AVG\(["']?([a-zA-Z0-9_]+)["']?\)\s*(?:AS\s+["']?([a-zA-Z0-9_]+)["']?)?/gi));
          for (const m of avgMatches) {
            const col = m[1];
            const alias = m[2] || `avg_${col}`;
            const sum = groupRows.reduce((acc, r) => acc + Number(r[col] || 0), 0);
            aggRow[alias] = groupRows.length ? sum / groupRows.length : 0;
          }

          const countMatches = Array.from(selectClause.matchAll(/COUNT\(["']?([a-zA-Z0-9_]+|\*)["']?\)\s*(?:AS\s+["']?([a-zA-Z0-9_]+)["']?)?/gi));
          for (const m of countMatches) {
            const alias = m[2] || `count`;
            aggRow[alias] = groupRows.length;
          }

          aggregatedRows.push(aggRow);
        }

        return aggregatedRows;
      }
    }

    return rows;
  }
}

export function createLocalDuckDB(options?: LocalDuckDBOptions): LocalDuckDBAdapter {
  return new LocalDuckDBAdapter(options);
}
