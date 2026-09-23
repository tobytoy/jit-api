import { MockGenerator } from './mock_generator.js';

export type MockClientMode = 'valid' | 'fuzz' | 'chaos';

export interface MockClientOptions {
  targetUrl: string; // e.g. http://localhost:3005
  protocol?: 'rest' | 'connect';
  timeoutMs?: number;
}

export interface MockClientResult {
  index: number;
  route: string;
  mode: MockClientMode;
  status: number;
  ok: boolean;
  latencyMs: number;
  sentPayload: Record<string, unknown>;
  responseBody?: any;
  error?: string;
}

export interface MockClientReport {
  targetUrl: string;
  totalRequests: number;
  successful: number;
  failed: number;
  avgLatencyMs: number;
  successRate: number;
  results: MockClientResult[];
}

export class MockClient {
  private targetUrl: string;
  private protocol: 'rest' | 'connect';
  private timeoutMs: number;

  constructor(options: MockClientOptions) {
    this.targetUrl = options.targetUrl.replace(/\/+$/, '');
    this.protocol = options.protocol || 'rest';
    this.timeoutMs = options.timeoutMs || 5000;
  }

  /**
   * Send a single synthetic request to target server
   */
  public async send(
    route: string,
    basePayload: Record<string, unknown>,
    mode: MockClientMode = 'valid',
    headers: Record<string, string> = {}
  ): Promise<MockClientResult> {
    const startTime = Date.now();

    // Prepare payload according to mode
    let payloadToSend: Record<string, unknown>;
    switch (mode) {
      case 'fuzz':
        payloadToSend = MockGenerator.fuzzPayload(basePayload);
        break;
      case 'chaos':
        payloadToSend = MockGenerator.chaosPayload(basePayload);
        break;
      case 'valid':
      default:
        payloadToSend = { ...basePayload };
        break;
    }

    // Determine target endpoint URL
    let url: string;
    if (this.protocol === 'connect') {
      const pascal = route
        .split(/[_-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
      url = `${this.targetUrl}/jit.v1.JITService/${pascal}`;
    } else {
      url = `${this.targetUrl}/api/mock/${route}`;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          ...headers,
        },
        body: JSON.stringify(payloadToSend),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      let body: any;

      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      return {
        index: 1,
        route,
        mode,
        status: res.status,
        ok: res.ok,
        latencyMs,
        sentPayload: payloadToSend,
        responseBody: body,
      };
    } catch (err: any) {
      return {
        index: 1,
        route,
        mode,
        status: 0,
        ok: false,
        latencyMs: Date.now() - startTime,
        sentPayload: payloadToSend,
        error: err.message,
      };
    }
  }

  /**
   * Run a synthetic batch test suite against target server
   */
  public async runSuite(
    route: string,
    samplePayload: Record<string, unknown>,
    count: number = 5,
    mode: MockClientMode = 'valid',
    headers: Record<string, string> = {}
  ): Promise<MockClientReport> {
    const results: MockClientResult[] = [];

    for (let i = 0; i < count; i++) {
      const res = await this.send(route, samplePayload, mode, headers);
      res.index = i + 1;
      results.push(res);
    }

    const successful = results.filter((r) => r.ok).length;
    const failed = results.length - successful;
    const avgLatency =
      results.length > 0 ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length : 0;

    return {
      targetUrl: this.targetUrl,
      totalRequests: results.length,
      successful,
      failed,
      avgLatencyMs: Number(avgLatency.toFixed(2)),
      successRate: Number(((successful / results.length) * 100).toFixed(1)),
      results,
    };
  }
}
