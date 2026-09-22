import { describe, expect, it } from 'vitest';
import { JITEngine } from '../core/jit_engine.js';
import { TypeSafeClient } from '../core/typesafe_client.js';
import { registerMockServices } from '../examples/mock_services.js';

describe('Needle Local Fallback (Option A - Decoupled Architecture)', () => {
  it('should automatically downgrade to Needle when TYPESAFE_API_KEY is not set', async () => {
    // Instantiate engine with no API key
    const clientWithoutKey = new TypeSafeClient({ apiKey: '' });
    expect(clientWithoutKey.hasApiKey()).toBe(false);

    const engine = new JITEngine({
      client: clientWithoutKey,
      stabilityThreshold: 2,
      confidenceThreshold: 0.8,
    });

    registerMockServices(engine);

    // 1. Dynamic Routing via Needle
    const request = {
      message: 'Please bill customer Acme Corp for 350 dollars urgently',
      customer: 'Acme Corp',
      amount: 350,
      currency: 'USD',
      priority: 'urgent',
    };

    const res = await engine.execute(request);
    expect(res.success).toBe(true);
    expect(res.context.route).toBe('create_invoice');
    expect(res.context.engineUsed).toBe('needle');
    expect(res.context.phase).toBe('phase1_dynamic');
    expect(res.context.intentConfidence).toBeGreaterThanOrEqual(0.85);
    expect(res.data.customer).toBe('Acme Corp');
  });

  it('should freeze route and transition to Phase 3 using Needle confidence scores', async () => {
    const clientWithoutKey = new TypeSafeClient({ apiKey: '' });
    const engine = new JITEngine({
      client: clientWithoutKey,
      stabilityThreshold: 2,
      confidenceThreshold: 0.8,
    });

    registerMockServices(engine);

    // Sample 1
    const req1 = {
      customer: 'Alpha Corp',
      amount: 100,
      currency: 'USD',
      priority: 'normal',
      itemCount: 1,
    };
    await engine.execute(req1, 'create_invoice');
    expect(engine.getRouteStatus('create_invoice').isFrozen).toBe(false);

    // Sample 2 (threshold = 2 -> triggers freeze)
    const req2 = {
      customer: 'Beta Corp',
      amount: 200,
      currency: 'USD',
      priority: 'normal',
      itemCount: 2,
    };
    const res2 = await engine.execute(req2, 'create_invoice');
    expect(res2.success).toBe(true);
    expect(engine.getRouteStatus('create_invoice').isFrozen).toBe(true);

    // Fast-Path (0ms AI latency)
    const fastReq = {
      customer: 'Gamma Corp',
      amount: 500,
      currency: 'USD',
      priority: 'urgent',
      itemCount: 3,
    };
    const fastRes = await engine.execute(fastReq, 'create_invoice');
    expect(fastRes.success).toBe(true);
    expect(fastRes.context.phase).toBe('phase3_frozen');
    expect(fastRes.context.aiLatencyMs).toBe(0);
  });

  it('should block malicious payloads using Needle local guardrail', async () => {
    const clientWithoutKey = new TypeSafeClient({ apiKey: '' });
    const engine = new JITEngine({
      client: clientWithoutKey,
    });

    registerMockServices(engine);

    const maliciousReq = {
      input: "admin'; DROP TABLE accounts; --",
      amount: 1000,
    };

    await expect(engine.execute(maliciousReq)).rejects.toThrow(
      /Request blocked by local security guardrail/i
    );
  });
});
