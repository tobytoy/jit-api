import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { JITEngine } from '../core/jit_engine.js';
import { LocalDuckDBAdapter } from '../data/local_duckdb.js';

describe('Markdown Spec Data Integration (## Store & ## Pipeline)', () => {
  let engine: JITEngine;

  beforeEach(() => {
    engine = new JITEngine();
  });

  afterEach(async () => {
    await engine.getDataEngine().closeAll();
  });

  it('should parse ## Store and ## Pipeline blocks from Markdown', () => {
    const md = `
# API: user_retention
Stage: prod

## Store: analytics
- Provider: local_duckdb
- Target: local_storage

## Pipeline
- Source: events
- Aggregate: SELECT event, COUNT(*) AS count FROM events GROUP BY event
- CacheTtl: 60000

## Logic
\`\`\`javascript
return await context.db.query("SELECT 1");
\`\`\`
`;
    const spec = MDParser.parse(md);
    expect(spec.route).toBe('user_retention');
    expect(spec.store).toBeDefined();
    expect(spec.store?.name).toBe('analytics');
    expect(spec.store?.provider).toBe('local_duckdb');
    expect(spec.store?.target).toBe('local_storage');

    expect(spec.pipeline).toBeDefined();
    expect(spec.pipeline?.source).toBe('events');
    expect(spec.pipeline?.aggregate).toContain('SELECT event');
    expect(spec.pipeline?.cacheTtlMs).toBe(60000);
  });

  it('should execute context.db in sandbox logic without LLM latency', async () => {
    // 1. Seed rows into engine's default DuckDB adapter
    const duckAdapter = engine.getDataEngine().getAdapter('analytics') as LocalDuckDBAdapter;
    expect(duckAdapter).toBeDefined();

    await duckAdapter.insertRows('orders', [
      { id: 1, category: 'Electronics', price: 1500 },
      { id: 2, category: 'Electronics', price: 500 },
      { id: 3, category: 'Furniture', price: 300 },
    ]);

    // 2. Parse and mount spec
    const specMd = `
# API: calculate_revenue
Stage: prod

## Store: analytics
- Provider: local_duckdb

## Logic
\`\`\`javascript
const res = await context.db.query("SELECT category, SUM(price) as total FROM orders GROUP BY category");
return {
  status: "OK",
  data: res.rows
};
\`\`\`
`;
    const spec = MDParser.parse(specMd);
    const routeDef = MDParser.toRouteDefinition(spec);
    engine.register(routeDef);

    // 3. Execute request
    const response = await engine.execute({ route: 'calculate_revenue' }, 'calculate_revenue');
    expect(response.success).toBe(true);
    expect(response.data.status).toBe('OK');

    const electronics = response.data.data.find((r: any) => r.category === 'Electronics');
    expect(electronics).toBeDefined();
    expect(Number(electronics.total || electronics.sum_price)).toBe(2000);
  });

  it('should automatically execute declarative ## Pipeline when ## Logic is omitted', async () => {
    const duckAdapter = engine.getDataEngine().getAdapter('analytics') as LocalDuckDBAdapter;
    await duckAdapter.insertRows('visits', [
      { page: '/home', ip: '1.1.1.1' },
      { page: '/home', ip: '2.2.2.2' },
      { page: '/pricing', ip: '3.3.3.3' },
    ]);

    const pipelineSpecMd = `
# API: page_traffic
Stage: prod

## Store: analytics
- Provider: local_duckdb

## Pipeline
- Source: visits
- Aggregate: SELECT page, COUNT(*) AS count FROM visits GROUP BY page
`;
    const spec = MDParser.parse(pipelineSpecMd);
    const routeDef = MDParser.toRouteDefinition(spec);
    engine.register(routeDef);

    const res = await engine.execute({ route: 'page_traffic' }, 'page_traffic');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('SUCCESS');
    expect(res.data.rowCount).toBe(2);

    const home = res.data.rows.find((r: any) => r.page === '/home');
    expect(home).toBeDefined();
    expect(Number(home.count)).toBe(2);
  });
});
