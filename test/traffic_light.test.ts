import { describe, expect, it } from 'vitest';
import { TrafficLightManager } from '../core/coordination.js';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Traffic Light Protocol & Anti-Yo-Yo Coordinator', () => {
  it('should evaluate GREEN for initial open route and Phase 3 frozen route', () => {
    const manager = new TrafficLightManager();

    // 1. Initial open route
    const openLight = manager.evaluateLight('api_ping', false, { consecutiveMatches: 0 });
    expect(openLight.color).toBe('GREEN');
    expect(openLight.canClientEdit).toBe(true);
    expect(openLight.canServerEdit).toBe(true);

    // 2. Frozen route
    const frozenLight = manager.evaluateLight('api_ping', true, { consecutiveMatches: 5, isStable: true });
    expect(frozenLight.color).toBe('GREEN');
    expect(frozenLight.label).toContain('SYNCED');
  });

  it('should evaluate YELLOW during schema negotiation and drift detection', () => {
    const manager = new TrafficLightManager();

    // 1. Negotiating samples (consecutive matches < threshold)
    const negotiatingLight = manager.evaluateLight('create_order', false, {
      consecutiveMatches: 2,
      requiredThreshold: 5,
    });
    expect(negotiatingLight.color).toBe('YELLOW');
    expect(negotiatingLight.label).toContain('NEGOTIATING');

    // 2. Drift detected
    const driftLight = manager.evaluateLight('create_order', false, undefined, true);
    expect(driftLight.color).toBe('YELLOW');
    expect(driftLight.description).toContain('漂移');
  });

  it('should evaluate RED when lock is acquired and enforce mutual exclusion', () => {
    const manager = new TrafficLightManager();

    // Server acquires benchmark lock
    const serverLock = manager.acquireLock({
      route: 'checkout_order',
      role: 'server',
      reason: 'Grafana k6 壓力測試中',
      ttlMs: 2000,
    });

    expect(serverLock.success).toBe(true);
    expect(serverLock.lock?.lockedBy).toBe('server');

    // Light should now be RED
    const redLight = manager.evaluateLight('checkout_order', true);
    expect(redLight.color).toBe('RED');
    expect(redLight.canServerEdit).toBe(true);
    expect(redLight.canClientEdit).toBe(false);

    // Client attempts to acquire lock on the same route -> blocked
    const clientAttempt = manager.acquireLock({
      route: 'checkout_order',
      role: 'client',
      reason: '錄製真實流量中',
      ttlMs: 5000,
    });

    expect(clientAttempt.success).toBe(false);
    expect(clientAttempt.error).toContain('SERVER 鎖定中');

    // Release lock
    const released = manager.releaseLock('checkout_order', 'server');
    expect(released).toBe(true);

    // After release, light returns to normal (GREEN)
    const restoredLight = manager.evaluateLight('checkout_order', true);
    expect(restoredLight.color).toBe('GREEN');
    expect(restoredLight.canClientEdit).toBe(true);
  });

  it('should automatically expire locks after TTL', async () => {
    const manager = new TrafficLightManager();

    // Acquire lock with short TTL (50ms)
    manager.acquireLock({
      route: 'temp_route',
      role: 'client',
      reason: '臨時混沌測試',
      ttlMs: 50,
    });

    expect(manager.evaluateLight('temp_route', false).color).toBe('RED');

    // Wait 60ms for TTL to expire
    await new Promise((r) => setTimeout(r, 60));

    expect(manager.evaluateLight('temp_route', false).color).toBe('GREEN');
    expect(manager.getLock('temp_route')).toBeUndefined();
  });

  it('should seamlessly coordinate with JITEngine getRouteStatus and lock APIs', async () => {
    const engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
    });

    const routeDef: RouteDefinition = {
      route: 'user_profile',
      description: 'Get user profile',
      intentCriteria: 'Fetch user profile',
      handler: async (payload) => ({ userId: payload.user_id, name: 'Alice' }),
    };

    engine.register(routeDef);

    // Initial status: GREEN
    let status = engine.getRouteStatus('user_profile');
    expect(status.trafficLight.color).toBe('GREEN');

    // Lock via engine
    const lockRes = engine.acquireLock({
      route: 'user_profile',
      role: 'server',
      reason: '架構重構',
      ttlMs: 1000,
    });
    expect(lockRes.success).toBe(true);

    status = engine.getRouteStatus('user_profile');
    expect(status.trafficLight.color).toBe('RED');
    expect(status.trafficLight.canClientEdit).toBe(false);

    // Unlock via engine
    engine.releaseLock('user_profile', 'server');
    status = engine.getRouteStatus('user_profile');
    expect(status.trafficLight.color).toBe('GREEN');
  });
});
