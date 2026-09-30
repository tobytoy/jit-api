import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpstreamClient, CircuitBreakerOpenError } from '../core/upstream_client.js';

describe('Declarative Upstream Client with Circuit Breaker & Resilience', () => {
  let client: UpstreamClient;

  beforeEach(() => {
    client = new UpstreamClient();
    client.resetCircuitBreaker();
    vi.restoreAllMocks();
  });

  it('should interpolate variables and env references in targetUrl', () => {
    process.env.TDX_TEST_KEY = 'secret_tdx_123';

    const template = 'https://api.example.com/v1/stations/{{station_id}}?auth={{env.TDX_TEST_KEY}}';
    const interpolated = client.interpolate(template, { station_id: '1000' });

    expect(interpolated).toBe('https://api.example.com/v1/stations/1000?auth=secret_tdx_123');
  });

  it('should retry on transient failures and succeed when upstream recovers', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        return new Response('Server Error', { status: 500 });
      }
      return new Response(JSON.stringify({ status: 'ok', attempt: callCount }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const res = await client.fetch('https://api.example.com/retry-test', {
      retry: { maxRetries: 2, backoffMs: 20 },
    });

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(callCount).toBe(2);
  });

  it('should open Circuit Breaker after threshold failures and return fallbackMock', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('Service Unavailable', { status: 503 });
    });

    const fallback = { fallback: true, message: 'TRA station offline fallback' };

    // Consecutive failures to trip circuit breaker (threshold = 2)
    for (let i = 0; i < 2; i++) {
      const res = await client.fetch('https://api.example.com/breaker-test', {
        retry: { maxRetries: 0 },
        circuitBreaker: { failureThreshold: 2, openDurationMs: 5000 },
        fallbackMock: fallback,
      });
      expect(res.fromFallbackMock).toBe(true);
      expect(res.data).toEqual(fallback);
    }

    // Circuit should now be OPEN
    const cbState = client.getCircuitBreakerState('https://api.example.com');
    expect(cbState.state).toBe('OPEN');

    // Next request should immediately hit Circuit Breaker without fetch call
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockClear();

    const fastPathFallback = await client.fetch('https://api.example.com/breaker-test', {
      circuitBreaker: { failureThreshold: 2, openDurationMs: 5000 },
      fallbackMock: fallback,
    });

    expect(fastPathFallback.fromFallbackMock).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should throw CircuitBreakerOpenError if no fallbackMock is provided when OPEN', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('Down', { status: 502 });
    });

    const target = 'https://api.fail.com/critical';

    // Trip circuit breaker
    for (let i = 0; i < 2; i++) {
      await expect(
        client.fetch(target, {
          retry: { maxRetries: 0 },
          circuitBreaker: { failureThreshold: 2, openDurationMs: 10000 },
        })
      ).rejects.toThrow();
    }

    // Now it should throw CircuitBreakerOpenError immediately
    await expect(
      client.fetch(target, {
        circuitBreaker: { failureThreshold: 2, openDurationMs: 10000 },
      })
    ).rejects.toThrow(CircuitBreakerOpenError);
  });
});
