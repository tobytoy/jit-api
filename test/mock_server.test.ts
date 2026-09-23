import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockServer } from '../core/mock_server.js';

describe('Smart Mock Server (Zero-Backend Development)', () => {
  let mockServer: MockServer;
  let baseUrl: string;

  beforeAll(async () => {
    mockServer = new MockServer({
      port: 0, // Ephemeral port
      stabilityThreshold: 3,
    });

    // Register a custom mock route
    mockServer.registerMock('get_user_info', {
      user_id: 'USR-999',
      username: 'Alice',
      role: 'ADMIN',
      permissions: ['read', 'write', 'execute'],
    });

    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should return mock info and registered mocks on GET /api/mock', async () => {
    const res = await fetch(`${baseUrl}/api/mock`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.server).toBe('JIT-API Smart Mock Server');
    expect(body.totalMocks).toBeGreaterThanOrEqual(1);

    const found = body.mocks.find((m: any) => m.route === 'get_user_info');
    expect(found).toBeDefined();
  });

  it('should respond with mock payload and crystallize to Phase 3 Fast-Path (0ms) after threshold', async () => {
    const payload = { user_id: 'USR-999' };

    // Request 1: Phase 1
    const res1 = await fetch(`${baseUrl}/api/mock/get_user_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.data.user_id).toBe('USR-999');
    expect(body1.data._mock).toBe(true);

    // Request 2
    await fetch(`${baseUrl}/api/mock/get_user_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Request 3: Freezes into Phase 3
    const res3 = await fetch(`${baseUrl}/api/mock/get_user_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body3 = await res3.json();
    expect(body3.context.phase).toBe('phase3_frozen');

    // Request 4: 0ms AI Latency Fast-Path!
    const res4 = await fetch(`${baseUrl}/api/mock/get_user_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body4 = await res4.json();
    expect(body4.context.phase).toBe('phase3_frozen');
    expect(body4.context.aiLatencyMs).toBe(0);
    expect(body4.data.username).toBe('Alice');
  });
});
