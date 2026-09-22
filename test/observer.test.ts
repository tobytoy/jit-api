import { describe, expect, it } from 'vitest';
import { SchemaObserver } from '../core/observer.js';
import { IRSchema } from '../core/types.js';

describe('SchemaObserver', () => {
  it('should track matching requests and trigger freeze on threshold', async () => {
    let frozenEventSchema: IRSchema | null = null;

    const observer = new SchemaObserver({
      stabilityThreshold: 3,
      confidenceThreshold: 0.8,
      onFreeze: (schema) => {
        frozenEventSchema = schema;
      },
    });

    const route = 'test_route';
    const samplePayload = {
      orderId: 'ORD-123',
      amount: 250,
      active: true,
      tags: ['vip', 'promo'],
    };

    // Sample 1
    const res1 = await observer.observe(route, samplePayload, 0.95);
    expect(res1.stable).toBe(false);
    expect(res1.consecutiveMatches).toBe(1);

    // Sample 2
    const res2 = await observer.observe(route, samplePayload, 0.95);
    expect(res2.stable).toBe(false);
    expect(res2.consecutiveMatches).toBe(2);

    // Sample 3 (threshold = 3)
    const res3 = await observer.observe(route, samplePayload, 0.95);
    expect(res3.stable).toBe(true);
    expect(res3.consecutiveMatches).toBe(3);
    expect(observer.isFrozen(route)).toBe(true);
    expect(frozenEventSchema).not.toBeNull();
    const schema = frozenEventSchema!;
    expect(schema.fields.orderId.type).toBe('string');
    expect(schema.fields.amount.type).toBe('number');
    expect(schema.fields.active.type).toBe('boolean');
    expect(schema.fields.tags.type).toBe('array');
  });

  it('should reset consecutive count on signature mismatch', async () => {
    const observer = new SchemaObserver({ stabilityThreshold: 3 });
    const route = 'drift_route';

    await observer.observe(route, { a: 1 }, 1.0);
    await observer.observe(route, { a: 2 }, 1.0);
    expect(observer.getMetrics(route).consecutiveMatches).toBe(2);

    // Mismatch (different field type)
    await observer.observe(route, { a: 'not-a-number' }, 1.0);
    expect(observer.getMetrics(route).consecutiveMatches).toBe(1);
  });
});
