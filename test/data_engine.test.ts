import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataEngine, createDataEngine } from '../data/data_engine.js';
import { LocalDuckDBAdapter, createLocalDuckDB } from '../data/local_duckdb.js';
import { createDBXPlugin, DBXMCPAdapter } from '../plugins/data_dbx.js';

describe('JIT-API Data Layer & DataEngine', () => {
  let engine: DataEngine;
  let localDuck: LocalDuckDBAdapter;

  beforeEach(async () => {
    engine = createDataEngine();
    localDuck = createLocalDuckDB({ name: 'analytics' });
    await localDuck.connect();
    engine.registerAdapter(localDuck, true);
  });

  afterEach(async () => {
    await engine.closeAll();
  });

  it('should initialize and list registered database adapters', () => {
    const list = engine.listAdapters();
    expect(list).toContain('analytics');
    expect(engine.getAdapter('analytics')).toBe(localDuck);
  });

  it('should perform local vectorized SQL aggregation with DuckDB adapter', async () => {
    // Seed in-memory rows
    await localDuck.insertRows('orders', [
      { id: 1, category: 'Electronics', price: 1200 },
      { id: 2, category: 'Electronics', price: 800 },
      { id: 3, category: 'Books', price: 40 },
      { id: 4, category: 'Books', price: 60 },
      { id: 5, category: 'Home', price: 150 },
    ]);

    // 1. Direct SQL Query
    const res = await engine.query('SELECT category, SUM(price) AS total FROM orders GROUP BY category');
    expect(res.rowCount).toBe(3);

    const electronics = res.rows.find((r: any) => r.category === 'Electronics');
    expect(electronics).toBeDefined();
    expect(Number(electronics.total || electronics.sum_price)).toBe(2000);

    const books = res.rows.find((r: any) => r.category === 'Books');
    expect(books).toBeDefined();
    expect(Number(books.total || books.sum_price)).toBe(100);
  });

  it('should support declarative aggregate() helper', async () => {
    await localDuck.insertRows('metrics', [
      { event: 'click', latency: 10 },
      { event: 'click', latency: 30 },
      { event: 'scroll', latency: 5 },
    ]);

    const agg = await engine.aggregate({
      table: 'metrics',
      dimensions: ['event'],
      metrics: { latency: 'avg' },
    });

    expect(agg.rowCount).toBe(2);
    const click = agg.rows.find((r: any) => r.event === 'click');
    expect(click).toBeDefined();
    expect(Number(click.avg_latency)).toBe(20);
  });

  it('should create sandbox-safe context with null prototype', async () => {
    const safeCtx = engine.createSafeContext('analytics');
    expect(Object.getPrototypeOf(safeCtx)).toBeNull();
    expect(typeof safeCtx.query).toBe('function');
    expect(typeof safeCtx.execute).toBe('function');

    await localDuck.insertRows('users', [{ id: 'u1', name: 'Alice' }]);
    const queryRes = await safeCtx.query('SELECT * FROM users');
    expect(queryRes.rowCount).toBeGreaterThan(0);
  });

  it('should connect to DBX MCP Plugin and execute sidecar queries', async () => {
    const dbxPlugin = createDBXPlugin({ mode: 'mock', name: 'dbx_prod' });
    await dbxPlugin.adapter.connect();
    engine.registerAdapter(dbxPlugin.adapter);

    expect(engine.listAdapters()).toContain('dbx_prod');

    const res = await engine.query('SELECT 1', [], 'dbx_prod');
    expect(res).toBeDefined();
    expect(res.rowCount).toBe(0); // Mock returns empty without error
    expect(await dbxPlugin.adapter.ping()).toBe(true);

    await dbxPlugin.adapter.disconnect();
  });
});
