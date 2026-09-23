import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Optimization 4: Schema Snapshot Persistence (0ms Cold Start)', () => {
  const snapshotPath = path.resolve(process.cwd(), '.jit', 'test_schemas.json');

  beforeAll(() => {
    if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
  });

  afterAll(() => {
    if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);
  });

  it('should save frozen schemas to disk and restore Phase 3 fast-path on engine restart', async () => {
    // 1. First Engine Instance: Observe & Freeze
    const engine1 = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
      persistence: { filePath: snapshotPath },
    });

    const routeDef: RouteDefinition = {
      route: 'get_balance',
      description: 'Get account balance',
      intentCriteria: 'Fetch balance',
      handler: async (payload) => ({ balance: 5000, accountId: payload.account_id }),
    };

    engine1.register(routeDef);

    // Freeze route in engine 1
    await engine1.execute({ route: 'get_balance', account_id: 'ACC-001' });
    await engine1.execute({ route: 'get_balance', account_id: 'ACC-001' });

    expect(engine1.getRouteStatus('get_balance').isFrozen).toBe(true);
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const snapshotContent = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    expect(snapshotContent.schemas['get_balance']).toBeDefined();
    expect(snapshotContent.schemas['get_balance'].length).toBe(1);

    // 2. Second Engine Instance: Simulate Server Cold Restart
    const engine2 = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
      persistence: { filePath: snapshotPath },
    });

    engine2.register(routeDef);

    // Verify engine 2 immediately starts with route frozen
    expect(engine2.getRouteStatus('get_balance').isFrozen).toBe(true);

    // Request #1 on cold-started server should immediately hit Phase 3 Fast-Path with 0ms AI latency!
    const res = await engine2.execute({ route: 'get_balance', account_id: 'ACC-001' });
    expect(res.context.phase).toBe('phase3_frozen');
    expect(res.context.aiLatencyMs).toBe(0);
    expect(res.context.isFallback).toBe(false);
    expect(res.data.balance).toBe(5000);
  });
});
