import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockClient } from '../core/mock_client.js';
import { MockServer } from '../core/mock_server.js';

describe('Smart Mock Client (Synthetic Traffic & Chaos Testing)', () => {
  let mockServer: MockServer;
  let baseUrl: string;

  beforeAll(async () => {
    mockServer = new MockServer({
      port: 0,
      stabilityThreshold: 5,
    });

    mockServer.registerMock('process_payment', (payload: any) => ({
      transactionId: 'TX-888',
      amount: payload.amount,
      status: 'PAID',
    }));

    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('should send valid synthetic requests and receive 200 OK', async () => {
    const client = new MockClient({ targetUrl: baseUrl });

    const sample = { amount: 150, currency: 'USD' };
    const res = await client.send('process_payment', sample, 'valid');

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.sentPayload.amount).toBe(150);
    expect(res.responseBody.data.transactionId).toBe('TX-888');
  });

  it('should send fuzzed requests (camelCase & string coercion) and succeed with auto-repair', async () => {
    const client = new MockClient({ targetUrl: baseUrl });

    const sample = { user_id: 1001, total_price: 299 };
    const res = await client.send('process_payment', sample, 'fuzz');

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    // Keys were fuzzed to camelCase
    expect(res.sentPayload.userId).toBe('1001');
    expect(res.sentPayload.totalPrice).toBe('299');
  });

  it('should run a multi-request suite and generate an aggregated report', async () => {
    const client = new MockClient({ targetUrl: baseUrl });

    const sample = { amount: 80, currency: 'TWD' };
    const report = await client.runSuite('process_payment', sample, 4, 'valid');

    expect(report.totalRequests).toBe(4);
    expect(report.successful).toBe(4);
    expect(report.failed).toBe(0);
    expect(report.successRate).toBe(100);
    expect(report.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.results.length).toBe(4);
  });
});
