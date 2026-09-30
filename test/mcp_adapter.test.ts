import { describe, it, expect } from 'vitest';
import { MCPAdapter } from '../core/mcp_adapter.js';
import { JITEngine } from '../core/jit_engine.js';
import { MDLoader } from '../core/md_loader.js';

describe('Model Context Protocol (MCP) Adapter', () => {
  it('should convert MD fields to valid Zod Schema shape', () => {
    const fields = [
      { name: 'item', type: 'string', description: 'Product name' },
      { name: 'amount', type: 'number', description: 'Order price' },
      {
        name: 'paymentMethod',
        type: 'enum',
        enumValues: { CREDIT_CARD: 'Credit Card', LINE_PAY: 'Line Pay' },
      },
      { name: 'isExpress', type: 'boolean', description: 'Fast shipping' },
    ];

    const shape = MCPAdapter.buildZodShape(fields);

    expect(shape.item).toBeDefined();
    expect(shape.amount).toBeDefined();
    expect(shape.paymentMethod).toBeDefined();
    expect(shape.isExpress).toBeDefined();
  });

  it('should mark fields as optional when f.optional is true or description contains optional keyword', () => {
    const fields = [
      { name: 'requiredField', type: 'string', description: 'Must have' },
      { name: 'optionalField1', type: 'string', description: 'Coupon code', optional: true },
      { name: 'optionalField2', type: 'number', description: 'Discount percentage (選填)' },
      { name: 'optionalField3', type: 'boolean', description: 'Send email [optional]' },
    ];

    const shape = MCPAdapter.buildZodShape(fields);
    expect(shape.requiredField.isOptional()).toBe(false);
    expect(shape.optionalField1.isOptional()).toBe(true);
    expect(shape.optionalField2.isOptional()).toBe(true);
    expect(shape.optionalField3.isOptional()).toBe(true);
  });

  it('should support inline specs in MDLoader for serverless environments', () => {
    const inlineContent = `# API: inline_test_route

> Stage: prod
> Description: Test inline spec

## Fields
| 欄位名稱 | 型態 | 說明 |
|---|---|---|
| test_id | string | Identifier |

\`\`\`javascript
return { ok: true, id: payload.test_id };
\`\`\`
`;
    const engine = new JITEngine();
    const loader = new MDLoader('/non_existent_specs_dir_test');
    loader.addInlineSpec('inline_test_route.api.md', inlineContent);

    const loaded = loader.loadAll(engine);
    expect(loaded.length).toBeGreaterThanOrEqual(1);
    expect(loaded.find((s) => s.route === 'inline_test_route')).toBeDefined();
    expect(engine.getRoutes().find((r) => r.route === 'inline_test_route')).toBeDefined();
  });

  it('should create WebStandardHandler and attach to Hono-like router', async () => {
    const engine = new JITEngine();
    const loader = new MDLoader('/non_existent_specs_dir_test');
    loader.addInlineSpec('test.api.md', `---
route: ping
description: Ping Pong
stage: prod
---
\`\`\`js
return { pong: true };
\`\`\`
`);

    const handler = MCPAdapter.createWebStandardHandler(engine, loader);
    expect(typeof handler).toBe('function');

    // Test attachToHono with mock Hono app
    const routesRegistered: string[] = [];
    const mockHono = {
      get: (path: string, fn: any) => routesRegistered.push(`GET ${path}`),
      post: (path: string, fn: any) => routesRegistered.push(`POST ${path}`),
      delete: (path: string, fn: any) => routesRegistered.push(`DELETE ${path}`),
      use: (path: string, fn: any) => routesRegistered.push(`USE ${path}`),
    };

    MCPAdapter.attachToHono(mockHono, engine, loader);
    expect(routesRegistered).toContain('GET /mcp');
    expect(routesRegistered).toContain('POST /mcp');
    expect(routesRegistered).toContain('DELETE /mcp');
    expect(routesRegistered).toContain('GET /sse');
    expect(routesRegistered).toContain('POST /sse');
    expect(routesRegistered).toContain('POST /message');
  });

  it('should create McpServer instance with registered tools from specs/', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('specs');
    const mcpServer = MCPAdapter.createMcpServer(engine, loader);

    expect(mcpServer).toBeDefined();
  });

  it('should only load prod routes when stageFilter is set to prod', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('specs');
    // specs/ contains date_converter.api.md which has Stage: dev
    const mcpServer = MCPAdapter.createMcpServer(engine, loader, 'prod');

    expect(mcpServer).toBeDefined();
    const routeNames = engine.getRoutes().map((r) => r.route);
    // date_converter should NOT be in routes (it is dev stage)
    expect(routeNames).not.toContain('date_converter');
    // create_order & process_refund should be in routes (they are prod stage)
    expect(routeNames).toContain('create_order');
    expect(routeNames).toContain('process_refund');
  });
});
