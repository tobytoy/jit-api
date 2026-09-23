import { describe, expect, it } from 'vitest';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Optimization 3: Sensitive Drift Detection & Evolution Watcher', () => {
  it('should trigger immediate fallback on extra keys in strict driftMode', async () => {
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
      driftMode: 'strict',
    });

    const routeDef: RouteDefinition = {
      route: 'pay_bill',
      description: 'Pay utility bill',
      intentCriteria: 'Pay bill',
      handler: async (payload) => ({ paid: true, billId: payload.bill_id }),
    };

    engine.register(routeDef);

    // Freeze route with { bill_id }
    await engine.execute({ route: 'pay_bill', bill_id: 101 });
    await engine.execute({ route: 'pay_bill', bill_id: 101 });
    expect(engine.getRouteStatus('pay_bill').isFrozen).toBe(true);

    // Send payload with unexpected extra field 'coupon' in strict mode
    const res = await engine.execute({ route: 'pay_bill', bill_id: 101, coupon: 'DISCOUNT10' });
    expect(res.context.isFallback).toBe(true);
  });

  it('should allow fast-path execution and trigger smooth evolution in evolve driftMode', async () => {
    let freezeCount = 0;
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
      driftMode: 'evolve',
      onFreeze: () => {
        freezeCount++;
      },
    });

    const routeDef: RouteDefinition = {
      route: 'send_message',
      description: 'Send a chat message',
      intentCriteria: 'Send message',
      handler: async (payload, ctx) => ({
        sent: true,
        text: payload.text,
        extra: payload.priority,
        softDrift: ctx.softDriftDetected,
      }),
    };

    engine.register(routeDef);

    // 1. Freeze v1 with { text }
    await engine.execute({ route: 'send_message', text: 'Hello' });
    await engine.execute({ route: 'send_message', text: 'Hello' });
    expect(engine.getRouteStatus('send_message').isFrozen).toBe(true);
    expect(freezeCount).toBe(1);

    // 2. Send payload with extra key 'priority'
    // In evolve mode, fast-path executes at 0ms and passes 'priority' to handler!
    const res1 = await engine.execute({ route: 'send_message', text: 'Urgent', priority: 'high' });
    expect(res1.context.phase).toBe('phase3_frozen');
    expect(res1.context.aiLatencyMs).toBe(0);
    expect(res1.context.softDriftDetected).toBe(true);
    expect(res1.data.extra).toBe('high');

    // Send 2nd sample with 'priority' to trigger evolution threshold
    const res2 = await engine.execute({ route: 'send_message', text: 'Update', priority: 'high' });
    expect(res2.context.phase).toBe('phase3_frozen');

    // Wait a brief tick for async evolution freeze
    await new Promise((r) => setTimeout(r, 50));
    expect(freezeCount).toBe(2);

    // Verify v2 now includes priority in schema fields
    const latestSchema = engine.getRouteStatus('send_message').frozenSchema;
    expect(latestSchema?.fields.priority).toBeDefined();
    expect(latestSchema?.version).toBe(2);
  });
});
