import { describe, expect, it } from 'vitest';
import { JITEngine } from '../core/jit_engine.js';
import { registerMockServices } from '../examples/mock_services.js';

describe('JIT Lifecycle & Fallback', () => {
  it(
    'should transition through Phase 1 -> Phase 2 -> Phase 3 -> Drift Fallback',
    async () => {
    let driftCount = 0;
    const engine = new JITEngine({
      stabilityThreshold: 2,
      onDrift: () => {
        driftCount++;
      },
    });

    registerMockServices(engine);

    // 1. First execution: Phase 1
    const p1 = {
      customer: 'Alpha Corp',
      amount: 100,
      currency: 'USD',
      priority: 'normal',
      itemCount: 2,
    };
    const res1 = await engine.execute(p1, 'create_invoice');
    expect(res1.success).toBe(true);
    expect(res1.context.route).toBe('create_invoice');

    // 2. Second execution (hits threshold = 2): Freeze triggered, enters Phase 3
    const p2 = {
      customer: 'Beta Corp',
      amount: 200,
      currency: 'USD',
      priority: 'normal',
      itemCount: 4,
    };
    const res2 = await engine.execute(p2, 'create_invoice');
    expect(res2.success).toBe(true);
    expect(engine.getRouteStatus('create_invoice').isFrozen).toBe(true);

    // 3. Third execution: Phase 3 Fast-Path (0 AI latency)
    const p3 = {
      customer: 'Gamma Corp',
      amount: 300,
      currency: 'USD',
      priority: 'urgent',
      itemCount: 1,
    };
    const res3 = await engine.execute(p3, 'create_invoice');
    expect(res3.success).toBe(true);
    expect(res3.context.phase).toBe('phase3_frozen');
    expect(res3.context.aiLatencyMs).toBe(0);

    // 4. Fourth execution: Schema Drift (amount passed as a string instead of number)
    const driftedPayload = {
      customer: 'Delta Corp',
      amount: 'INVALID_STRING_AMOUNT',
      currency: 'USD',
      priority: 'urgent',
      itemCount: 1,
    };
    const resDrift = await engine.execute(driftedPayload, 'create_invoice');
    expect(resDrift.success).toBe(true);
    expect(resDrift.context.isFallback).toBe(true);
    expect(driftCount).toBe(1);
    // Route is un-frozen and reset to Phase 1/2 for v2 observation
    expect(engine.getRouteStatus('create_invoice').isFrozen).toBe(false);
  }, 25000);
});
