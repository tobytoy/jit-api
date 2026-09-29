/**
 * JIT Protocol Synthesis Framework - Prometheus Observability Plugin
 * 
 * Provides production-grade Prometheus metrics exposition (OpenMetrics / text-0.0.4)
 * with histogram latency buckets (P50, P90, P99), request counters, freeze gauges,
 * and seamless HTTP /metrics endpoint integration.
 */

import { JITPlugin, JITPluginContext, JITRouteEvent } from '../core/plugin.js';

export interface PrometheusPluginOptions {
  prefix?: string;
  defaultBuckets?: number[]; // Latency buckets in seconds (e.g. [0.001, 0.005, 0.01, ...])
  endpointPath?: string;     // Default '/metrics'
}

export interface MetricBucket {
  le: number;
  count: number;
}

export interface RouteLatencyHistogram {
  buckets: MetricBucket[];
  sum: number;
  count: number;
  durations: number[]; // For accurate quantile calculation
}

export class PrometheusRegistry {
  private prefix: string;
  private defaultBuckets: number[];

  // Counters: key = route|phase|status
  private requestCounts: Map<string, number> = new Map();
  // Histograms: key = route|phase
  private requestHistograms: Map<string, RouteLatencyHistogram> = new Map();
  // AI Latency Histograms: key = engine
  private aiHistograms: Map<string, RouteLatencyHistogram> = new Map();
  // Frozen routes gauge: set of frozen routes
  private frozenRoutes: Set<string> = new Set();
  // Drift events counter: key = route
  private driftCounts: Map<string, number> = new Map();

  constructor(options?: PrometheusPluginOptions) {
    this.prefix = options?.prefix || 'jit';
    this.defaultBuckets = options?.defaultBuckets || [
      0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ];
  }

  private createEmptyHistogram(): RouteLatencyHistogram {
    return {
      buckets: this.defaultBuckets.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
      durations: [],
    };
  }

  public recordRequest(event: JITRouteEvent): void {
    const status = event.success ? 'success' : 'error';
    const countKey = `${event.route}|${event.phase}|${status}`;
    this.requestCounts.set(countKey, (this.requestCounts.get(countKey) || 0) + 1);

    // Latency histogram
    const histKey = `${event.route}|${event.phase}`;
    let hist = this.requestHistograms.get(histKey);
    if (!hist) {
      hist = this.createEmptyHistogram();
      this.requestHistograms.set(histKey, hist);
    }

    const durationSec = event.durationMs / 1000;
    hist.sum += durationSec;
    hist.count += 1;
    hist.durations.push(event.durationMs);
    // Keep max 500 samples per route for quantile calculation
    if (hist.durations.length > 500) {
      hist.durations.shift();
    }

    for (const b of hist.buckets) {
      if (durationSec <= b.le) {
        b.count += 1;
      }
    }

    // AI Latency if available
    if (event.aiLatencyMs !== undefined && event.engineUsed) {
      const engineKey = event.engineUsed;
      let aiHist = this.aiHistograms.get(engineKey);
      if (!aiHist) {
        aiHist = this.createEmptyHistogram();
        this.aiHistograms.set(engineKey, aiHist);
      }
      const aiSec = event.aiLatencyMs / 1000;
      aiHist.sum += aiSec;
      aiHist.count += 1;
      aiHist.durations.push(event.aiLatencyMs);
      if (aiHist.durations.length > 500) {
        aiHist.durations.shift();
      }
      for (const b of aiHist.buckets) {
        if (aiSec <= b.le) {
          b.count += 1;
        }
      }
    }
  }

  public recordFreeze(route: string): void {
    this.frozenRoutes.add(route);
  }

  public recordUnfreeze(route: string): void {
    this.frozenRoutes.delete(route);
  }

  public recordDrift(route: string): void {
    this.driftCounts.set(route, (this.driftCounts.get(route) || 0) + 1);
  }

  public calculateQuantiles(durations: number[]): { p50: number; p90: number; p99: number } {
    if (durations.length === 0) {
      return { p50: 0, p90: 0, p99: 0 };
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const getIndex = (q: number) => Math.min(sorted.length - 1, Math.floor(sorted.length * q));
    return {
      p50: sorted[getIndex(0.5)],
      p90: sorted[getIndex(0.9)],
      p99: sorted[getIndex(0.99)],
    };
  }

  /**
   * Render metrics in Prometheus Text 0.0.4 exposition format
   */
  public getMetricsAsText(): string {
    const lines: string[] = [];

    // 1. Request Counter
    lines.push(`# HELP ${this.prefix}_requests_total Total number of HTTP/RPC requests processed by JIT API`);
    lines.push(`# TYPE ${this.prefix}_requests_total counter`);
    for (const [key, count] of this.requestCounts.entries()) {
      const [route, phase, status] = key.split('|');
      lines.push(`${this.prefix}_requests_total{route="${route}",phase="${phase}",status="${status}"} ${count}`);
    }
    lines.push('');

    // 2. Request Latency Histogram
    lines.push(`# HELP ${this.prefix}_request_duration_seconds HTTP request latency histogram in seconds`);
    lines.push(`# TYPE ${this.prefix}_request_duration_seconds histogram`);
    for (const [key, hist] of this.requestHistograms.entries()) {
      const [route, phase] = key.split('|');
      for (const b of hist.buckets) {
        lines.push(
          `${this.prefix}_request_duration_seconds_bucket{route="${route}",phase="${phase}",le="${b.le}"} ${b.count}`
        );
      }
      lines.push(
        `${this.prefix}_request_duration_seconds_bucket{route="${route}",phase="${phase}",le="+Inf"} ${hist.count}`
      );
      lines.push(
        `${this.prefix}_request_duration_seconds_sum{route="${route}",phase="${phase}"} ${hist.sum.toFixed(6)}`
      );
      lines.push(
        `${this.prefix}_request_duration_seconds_count{route="${route}",phase="${phase}"} ${hist.count}`
      );
    }
    lines.push('');

    // 3. Request Latency Summary (P50, P90, P99 in milliseconds)
    lines.push(`# HELP ${this.prefix}_request_duration_ms Summary quantiles for request duration in ms`);
    lines.push(`# TYPE ${this.prefix}_request_duration_ms summary`);
    for (const [key, hist] of this.requestHistograms.entries()) {
      const [route, phase] = key.split('|');
      const quantiles = this.calculateQuantiles(hist.durations);
      lines.push(`${this.prefix}_request_duration_ms{route="${route}",phase="${phase}",quantile="0.5"} ${quantiles.p50.toFixed(2)}`);
      lines.push(`${this.prefix}_request_duration_ms{route="${route}",phase="${phase}",quantile="0.9"} ${quantiles.p90.toFixed(2)}`);
      lines.push(`${this.prefix}_request_duration_ms{route="${route}",phase="${phase}",quantile="0.99"} ${quantiles.p99.toFixed(2)}`);
    }
    lines.push('');

    // 4. AI Latency
    if (this.aiHistograms.size > 0) {
      lines.push(`# HELP ${this.prefix}_ai_latency_seconds Latency of AI intent classification in seconds`);
      lines.push(`# TYPE ${this.prefix}_ai_latency_seconds histogram`);
      for (const [engine, hist] of this.aiHistograms.entries()) {
        for (const b of hist.buckets) {
          lines.push(`${this.prefix}_ai_latency_seconds_bucket{engine="${engine}",le="${b.le}"} ${b.count}`);
        }
        lines.push(`${this.prefix}_ai_latency_seconds_bucket{engine="${engine}",le="+Inf"} ${hist.count}`);
        lines.push(`${this.prefix}_ai_latency_seconds_sum{engine="${engine}"} ${hist.sum.toFixed(6)}`);
        lines.push(`${this.prefix}_ai_latency_seconds_count{engine="${engine}"} ${hist.count}`);
      }
      lines.push('');
    }

    // 5. Frozen Routes Gauge
    lines.push(`# HELP ${this.prefix}_routes_frozen_total Total routes currently crystallized/frozen in Phase 3`);
    lines.push(`# TYPE ${this.prefix}_routes_frozen_total gauge`);
    lines.push(`${this.prefix}_routes_frozen_total ${this.frozenRoutes.size}`);
    lines.push('');

    // 6. Schema Drift Counter
    lines.push(`# HELP ${this.prefix}_drift_detected_total Total schema drift events detected per route`);
    lines.push(`# TYPE ${this.prefix}_drift_detected_total counter`);
    for (const [route, count] of this.driftCounts.entries()) {
      lines.push(`${this.prefix}_drift_detected_total{route="${route}"} ${count}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Express / Connect / HTTP compatible middleware handler for GET /metrics
   */
  public createMetricsHandler(): (req: any, res: any) => void {
    return (_req: any, res: any) => {
      const text = this.getMetricsAsText();
      if (res.setHeader) {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.end(text);
      } else if (res.status && res.send) {
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.status(200).send(text);
      }
    };
  }
}

/**
 * Factory for Prometheus Observability Plugin
 */
export function createPrometheusPlugin(options?: PrometheusPluginOptions): JITPlugin & {
  registry: PrometheusRegistry;
  getMetricsAsText: () => string;
  createMetricsHandler: () => (req: any, res: any) => void;
} {
  const registry = new PrometheusRegistry(options);

  return {
    name: 'observability-prometheus',
    version: '1.4.2',
    description: 'Prometheus metrics exporter with P50/P90/P99 latency histograms and /metrics endpoint',
    registry,
    getMetricsAsText: () => registry.getMetricsAsText(),
    createMetricsHandler: () => registry.createMetricsHandler(),

    async onInit(ctx: JITPluginContext) {
      if (ctx.engine?.observer) {
        // Subscribe to observer freeze events
        ctx.engine.observer.onFreeze?.((route: string) => {
          registry.recordFreeze(route);
        });
      }
    },

    async onRouteExecuted(event: JITRouteEvent) {
      registry.recordRequest(event);
      if (event.phase === 'phase3_frozen') {
        registry.recordFreeze(event.route);
      }
    },
  };
}
