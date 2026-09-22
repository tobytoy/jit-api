/**
 * JIT Benchmark Runner
 * 
 * Executes Grafana k6 stress tests and parses the results into structured JSON.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface BenchmarkOptions {
  url?: string;
  mode?: 'phase1' | 'phase3';
  vus?: number;
  duration?: string; // e.g. "5s", "10s"
}

export interface BenchmarkMetrics {
  mode: 'phase1' | 'phase3';
  vus: number;
  durationSec: number;
  totalRequests: number;
  rps: number;
  successRate: number;
  latency: {
    avg: number;
    min: number;
    med: number;
    max: number;
    p90: number;
    p95: number;
    p99: number;
  };
  runner: 'k6' | 'in_process';
  rawOutput?: string;
}

export class BenchmarkRunner {
  private k6BinPath: string;
  private scriptPath: string;

  constructor() {
    const localK6 = path.resolve('bin/k6');
    this.k6BinPath = fs.existsSync(localK6) ? localK6 : 'k6';
    this.scriptPath = path.resolve('benchmark/k6_stress_test.js');
  }

  /**
   * Run benchmark using Grafana k6
   */
  public async run(options: BenchmarkOptions = {}): Promise<BenchmarkMetrics> {
    const mode = options.mode || 'phase3';
    const vus = options.vus || 10;
    const duration = options.duration || '5s';
    const url = options.url || 'http://127.0.0.1:3005/api/jit';

    const durationSeconds = parseInt(duration, 10) || 5;
    const summaryFile = path.resolve(`TMP/k6_summary_${Date.now()}.json`);

    const dir = path.dirname(summaryFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const env = {
      ...process.env,
      K6_URL: url,
      K6_MODE: mode,
      K6_VUS: String(vus),
      K6_DURATION: duration,
    };

    try {
      const { stdout } = await execFileAsync(
        this.k6BinPath,
        ['run', '--summary-export', summaryFile, this.scriptPath],
        { env, timeout: (durationSeconds + 15) * 1000 }
      );

      if (fs.existsSync(summaryFile)) {
        const rawJson = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
        fs.unlinkSync(summaryFile);

        const httpDuration = rawJson.metrics?.http_req_duration || {};
        const reqs = rawJson.metrics?.http_reqs || {};
        const checks = rawJson.metrics?.checks || {};

        const passes = checks.passes || 0;
        const fails = checks.fails || 0;
        const totalChecks = passes + fails;
        const successRate = totalChecks > 0 ? passes / totalChecks : 1.0;

        return {
          mode,
          vus,
          durationSec: durationSeconds,
          totalRequests: reqs.count || 0,
          rps: Math.round((reqs.rate || 0) * 10) / 10,
          successRate: Math.round(successRate * 100) / 100,
          latency: {
            avg: Math.round((httpDuration.avg || 0) * 100) / 100,
            min: Math.round((httpDuration.min || 0) * 100) / 100,
            med: Math.round((httpDuration.med || 0) * 100) / 100,
            max: Math.round((httpDuration.max || 0) * 100) / 100,
            p90: Math.round((httpDuration['p(90)'] || 0) * 100) / 100,
            p95: Math.round((httpDuration['p(95)'] || 0) * 100) / 100,
            p99: Math.round((httpDuration['p(99)'] || httpDuration['p(95)'] || 0) * 100) / 100,
          },
          runner: 'k6',
          rawOutput: stdout,
        };
      }

      throw new Error('k6 summary file was not generated.');
    } catch (err: any) {
      console.warn('[BenchmarkRunner] k6 execution failed or timed out:', err.message);
      // Fallback in-process load test if k6 execution fails
      return this.runInProcess(url, mode, vus, durationSeconds);
    }
  }

  /**
   * Lightweight in-process fallback runner
   */
  private async runInProcess(
    url: string,
    mode: 'phase1' | 'phase3',
    vus: number,
    durationSec: number
  ): Promise<BenchmarkMetrics> {
    const payload =
      mode === 'phase1'
        ? { message: '我想買一台相機，刷卡，42000元', item: '相機', amount: 42000 }
        : { route: 'create_order', item: '耳機', amount: 2500, paymentMethod: 'LINE_PAY' };

    const latencies: number[] = [];
    let successes = 0;
    const startTime = Date.now();
    const endTime = startTime + durationSec * 1000;

    const worker = async () => {
      while (Date.now() < endTime) {
        const reqStart = Date.now();
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (resp.ok) successes++;
          latencies.push(Date.now() - reqStart);
        } catch {
          latencies.push(Date.now() - reqStart);
        }
      }
    };

    const workers = Array.from({ length: vus }, () => worker());
    await Promise.all(workers);

    const total = latencies.length;
    latencies.sort((a, b) => a - b);

    const p = (pct: number) => (total > 0 ? latencies[Math.floor((total * pct) / 100)] || 0 : 0);
    const avg = total > 0 ? latencies.reduce((a, b) => a + b, 0) / total : 0;
    const actualSec = (Date.now() - startTime) / 1000;

    return {
      mode,
      vus,
      durationSec,
      totalRequests: total,
      rps: Math.round((total / (actualSec || 1)) * 10) / 10,
      successRate: total > 0 ? Math.round((successes / total) * 100) / 100 : 0,
      latency: {
        avg: Math.round(avg * 100) / 100,
        min: latencies[0] || 0,
        med: p(50),
        max: latencies[latencies.length - 1] || 0,
        p90: p(90),
        p95: p(95),
        p99: p(99),
      },
      runner: 'in_process',
    };
  }
}
