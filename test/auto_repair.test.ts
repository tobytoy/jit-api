import { describe, expect, it } from 'vitest';
import { AutoRepairer } from '../core/auto_repair.js';
import { JITEngine } from '../core/jit_engine.js';
import { IRField, RouteDefinition } from '../core/types.js';

describe('Optimization 2: Intelligent Schema Auto-Repair', () => {
  it('should auto-repair camelCase to snake_case, type coercions, and aliases directly', () => {
    const repairer = new AutoRepairer();

    const expectedFields: Record<string, IRField> = {
      user_id: { name: 'user_id', type: 'number', required: true },
      is_active: { name: 'is_active', type: 'boolean', required: true },
      quantity: { name: 'quantity', type: 'number', required: true },
      tags: { name: 'tags', type: 'array', itemType: 'string', required: false },
    };

    const driftedInput = {
      userId: '1001', // camelCase + string number
      is_active: 'true', // string boolean
      qty: '50', // alias + string number
      tags: 'admin,ops,vip', // comma separated string to array
    };

    const result = repairer.repair(driftedInput, expectedFields);
    expect(result.repaired).toBe(true);
    expect(result.payload.user_id).toBe(1001);
    expect(result.payload.is_active).toBe(true);
    expect(result.payload.quantity).toBe(50);
    expect(result.payload.tags).toEqual(['admin', 'ops', 'vip']);
    expect(result.payload.userId).toBeUndefined();
    expect(result.payload.qty).toBeUndefined();
    expect(result.modifications.length).toBeGreaterThanOrEqual(4);
  });

  it('should execute end-to-end auto-repair during fallback on frozen route', async () => {
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 3,
    });

    const routeDef: RouteDefinition = {
      route: 'checkout_order',
      description: 'Checkout order with customer and amount',
      intentCriteria: 'Checkout customer order',
      handler: async (payload, ctx) => {
        // Business logic strictly expects snake_case and number!
        if (typeof payload.customer_id !== 'number') {
          throw new Error(`customer_id must be a number! Got ${typeof payload.customer_id}`);
        }
        return {
          orderProcessed: true,
          customerId: payload.customer_id,
          amount: payload.amount,
        };
      },
    };

    engine.register(routeDef);

    // 1. Train and freeze route on standard schema
    const validSample = { route: 'checkout_order', customer_id: 88, amount: 250 };
    await engine.execute(validSample);
    await engine.execute(validSample);
    const freezeRes = await engine.execute(validSample);
    expect(freezeRes.context.phase).toBe('phase3_frozen');

    // 2. Client suddenly changes payload to camelCase and string number:
    // customerId: "88"
    const driftedPayload = {
      route: 'checkout_order',
      customerId: '88',
      amount: '250',
    };

    const res = await engine.execute(driftedPayload);
    // Auto-repair prevented handler crash!
    expect(res.success).toBe(true);
    expect(res.data.orderProcessed).toBe(true);
    expect(res.data.customerId).toBe(88);
    expect(res.context.isFallback).toBe(true);
    expect(res.context.autoRepaired).toBe(true);
    expect(res.context.repairDetails?.length).toBeGreaterThan(0);
  });
});
