import { describe, expect, it } from 'vitest';
import { GolangBlock } from '../blocks/ast_golang/go_block.js';
import { PythonBlock } from '../blocks/ast_python/py_block.js';
import { TypeScriptBlock } from '../blocks/ast_typescript/ts_block.js';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Optimization 6: Bidirectional Schema Observation (Request + Response)', () => {
  it('should infer both Request and Response schemas and generate typed multi-language code', async () => {
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
    });

    const routeDef: RouteDefinition = {
      route: 'create_order',
      description: 'Create an ecommerce order',
      intentCriteria: 'Create order',
      handler: async (payload) => ({
        order_id: 'ORD-777',
        total_amount: 199.99,
        is_paid: true,
        tags: ['express', 'fragile'],
      }),
    };

    engine.register(routeDef);

    // Train and freeze route
    const req = { route: 'create_order', customer_name: 'Bob', quantity: 2 };
    await engine.execute(req);
    const freezeRes = await engine.execute(req);

    expect(freezeRes.context.phase).toBe('phase3_frozen');

    // Inspect the frozen schema
    const schema = engine.getRouteStatus('create_order').frozenSchema;
    expect(schema).toBeDefined();
    expect(schema?.fields.customer_name).toBeDefined();
    expect(schema?.fields.quantity).toBeDefined();

    // Verify inferred responseFields
    expect(schema?.responseFields).toBeDefined();
    expect(schema?.responseFields?.order_id.type).toBe('string');
    expect(schema?.responseFields?.total_amount.type).toBe('number');
    expect(schema?.responseFields?.is_paid.type).toBe('boolean');
    expect(schema?.responseFields?.tags.type).toBe('array');

    // 1. Verify Protobuf Generation
    const protoCode = GolangBlock.generateProto(schema!);
    expect(protoCode).toContain('message CreateOrderRequest');
    expect(protoCode).toContain('message CreateOrderResponse');
    expect(protoCode).toContain('string order_id = 3;');
    expect(protoCode).toContain('double total_amount = 4;');
    expect(protoCode).toContain('bool is_paid = 5;');
    expect(protoCode).toContain('repeated string tags = 6;');

    // 2. Verify TypeScript Generation
    const tsCode = TypeScriptBlock.generate(schema!);
    expect(tsCode).toContain('export const CreateOrderRequestSchema = z.object(');
    expect(tsCode).toContain('export const CreateOrderResponseSchema = z.object(');
    expect(tsCode).toContain('export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;');

    // 3. Verify Python Generation
    const pyCode = PythonBlock.generate(schema!);
    expect(pyCode).toContain('class CreateOrderRequest(BaseModel):');
    expect(pyCode).toContain('class CreateOrderResponse(BaseModel):');
    expect(pyCode).toContain('order_id: str');
    expect(pyCode).toContain('total_amount: float');
    expect(pyCode).toContain('is_paid: bool');
    expect(pyCode).toContain('tags: list[str]');
  });
});
