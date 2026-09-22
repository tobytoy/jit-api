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

  it('should create McpServer instance with registered tools from specs/', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('specs');
    const mcpServer = MCPAdapter.createMcpServer(engine, loader);

    expect(mcpServer).toBeDefined();
  });
});
