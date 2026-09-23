import { describe, expect, it } from 'vitest';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Optimization 1: Multi-Version Schema Coexistence', () => {
  it('should allow v1 and v2 clients to co-exist in Phase 3 without drift ping-pong', async () => {
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 3,
      driftMode: 'evolve',
    });

    const routeDef: RouteDefinition = {
      route: 'user_profile',
      description: 'Get user profile by id',
      intentCriteria: 'Fetch user profile',
      handler: async (payload, ctx) => ({
        userId: payload.user_id,
        versionUsed: ctx.version,
        phase: ctx.phase,
      }),
    };

    engine.register(routeDef);

    // 1. Train v1 (numeric user_id) to freeze (threshold = 3)
    const v1Payload = { route: 'user_profile', user_id: 101 };
    await engine.execute(v1Payload);
    await engine.execute(v1Payload);
    const v1FrozenRes = await engine.execute(v1Payload);
    expect(v1FrozenRes.context.phase).toBe('phase3_frozen');
    expect(v1FrozenRes.context.version).toBe(1);

    // Verify v1 fast-path: 0ms AI latency
    const v1Fast = await engine.execute(v1Payload);
    expect(v1Fast.context.phase).toBe('phase3_frozen');
    expect(v1Fast.context.aiLatencyMs).toBe(0);
    expect(v1Fast.context.version).toBe(1);

    // 2. Introduce v2 format (string user_id e.g. "USR-101")
    // First v2 call triggers fallback/observation for v2
    const v2Payload = { route: 'user_profile', user_id: 'USR-101' };
    const v2Call1 = await engine.execute(v2Payload);
    expect(v2Call1.context.isFallback).toBe(true);

    // Train v2 for remaining 2 samples to freeze v2
    await engine.execute(v2Payload);
    const v2FrozenRes = await engine.execute(v2Payload);
    expect(v2FrozenRes.context.phase).toBe('phase3_frozen');

    // 3. Now BOTH v1 and v2 clients send requests!
    // Neither should trigger drift or fallback; both execute 0ms fast-path!
    const v1ClientReq = await engine.execute({ route: 'user_profile', user_id: 202 });
    expect(v1ClientReq.context.phase).toBe('phase3_frozen');
    expect(v1ClientReq.context.aiLatencyMs).toBe(0);
    expect(v1ClientReq.context.version).toBe(1);
    expect(v1ClientReq.context.isFallback).toBe(false);

    const v2ClientReq = await engine.execute({ route: 'user_profile', user_id: 'USR-202' });
    expect(v2ClientReq.context.phase).toBe('phase3_frozen');
    expect(v2ClientReq.context.aiLatencyMs).toBe(0);
    expect(v2ClientReq.context.version).toBe(2);
    expect(v2ClientReq.context.isFallback).toBe(false);

    // Inspect route status
    const status = engine.getRouteStatus('user_profile');
    expect(status.frozenSchemas.length).toBe(2);
    expect(status.frozenSchemas.map((s) => s.version)).toEqual([2, 1]);
  });
});
