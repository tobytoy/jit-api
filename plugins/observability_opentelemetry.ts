/**
 * JIT Protocol Synthesis Framework - OpenTelemetry Distributed Tracing Plugin
 * 
 * Provides W3C TraceContext compliant distributed tracing (traceparent / baggage)
 * with hierarchical spans (root request, route classify, sandbox logic, upstream proxy)
 * and pluggable exporters (InMemory, Console, Custom).
 */

import crypto from 'node:crypto';
import { JITPlugin, JITPluginContext, JITRouteEvent } from '../core/plugin.js';

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface JITSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'UNSET' | 'OK' | 'ERROR';
  attributes: SpanAttributes;
  error?: string;
}

export interface SpanExporter {
  export(spans: JITSpan[]): void | Promise<void>;
}

export class InMemorySpanExporter implements SpanExporter {
  public spans: JITSpan[] = [];
  private maxSpans: number;

  constructor(maxSpans = 1000) {
    this.maxSpans = maxSpans;
  }

  export(spans: JITSpan[]): void {
    this.spans.push(...spans);
    if (this.spans.length > this.maxSpans) {
      this.spans = this.spans.slice(-this.maxSpans);
    }
  }

  getSpansByTraceId(traceId: string): JITSpan[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  clear(): void {
    this.spans = [];
  }
}

export class ConsoleSpanExporter implements SpanExporter {
  export(spans: JITSpan[]): void {
    for (const span of spans) {
      const statusIcon = span.status === 'OK' ? '🟢' : span.status === 'ERROR' ? '🔴' : '⚪';
      console.log(
        `[OTel Trace] ${statusIcon} [${span.name}] TraceId: ${span.traceId.slice(0, 8)}... | SpanId: ${span.spanId} | Duration: ${span.durationMs?.toFixed(2)}ms | Route: ${span.attributes['jit.route'] || '-'}`
      );
    }
  }
}

export interface OpenTelemetryPluginOptions {
  serviceName?: string;
  exporter?: SpanExporter;
  propagateResponseHeader?: boolean; // If true, injects traceparent in responses
}

export class OpenTelemetryTracer {
  public serviceName: string;
  public exporter: SpanExporter;
  private propagateResponseHeader: boolean;
  private activeTraces = new Map<string, JITSpan[]>();

  constructor(options?: OpenTelemetryPluginOptions) {
    this.serviceName = options?.serviceName || 'jit-api';
    this.exporter = options?.exporter || new InMemorySpanExporter();
    this.propagateResponseHeader = options?.propagateResponseHeader ?? true;
  }

  /**
   * Generate 16-byte random hex string for traceId (32 hex characters)
   */
  public generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate 8-byte random hex string for spanId (16 hex characters)
   */
  public generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Parse W3C TraceContext header: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
   */
  public parseTraceparent(header?: string): { traceId: string; parentSpanId?: string } | null {
    if (!header || typeof header !== 'string') return null;
    const parts = header.trim().split('-');
    if (parts.length < 4 || parts[0] !== '00') return null;
    const traceId = parts[1];
    const parentSpanId = parts[2];
    if (traceId.length !== 32 || parentSpanId.length !== 16) return null;
    return { traceId, parentSpanId };
  }

  /**
   * Format W3C Traceparent header string
   */
  public formatTraceparent(traceId: string, spanId: string): string {
    return `00-${traceId}-${spanId}-01`;
  }

  /**
   * Start a new span
   */
  public startSpan(
    name: string,
    options: {
      traceId?: string;
      parentSpanId?: string;
      attributes?: SpanAttributes;
    } = {}
  ): JITSpan {
    const traceId = options.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();

    const span: JITSpan = {
      traceId,
      spanId,
      parentSpanId: options.parentSpanId,
      name,
      startTime: Date.now(),
      status: 'UNSET',
      attributes: {
        'service.name': this.serviceName,
        ...options.attributes,
      },
    };

    if (!this.activeTraces.has(traceId)) {
      this.activeTraces.set(traceId, []);
    }
    this.activeTraces.get(traceId)!.push(span);

    return span;
  }

  /**
   * End a span and export when trace completes
   */
  public endSpan(span: JITSpan, status: 'OK' | 'ERROR' = 'OK', error?: string): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (error) {
      span.error = error;
      span.attributes['error.message'] = error;
    }

    // Export completed span
    Promise.resolve(this.exporter.export([span])).catch((err) => {
      console.warn('[OpenTelemetryTracer] Exporter error:', err);
    });
  }

  /**
   * Execute an async function wrapped within an instrumented span
   */
  public async withSpan<T>(
    name: string,
    options: { traceId?: string; parentSpanId?: string; attributes?: SpanAttributes },
    fn: (span: JITSpan) => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      this.endSpan(span, 'OK');
      return result;
    } catch (err: any) {
      this.endSpan(span, 'ERROR', err?.message || String(err));
      throw err;
    }
  }

  /**
   * Extract or create trace context from incoming HTTP headers
   */
  public extractContextFromHeaders(headers?: Record<string, string | string[] | undefined>): {
    traceId: string;
    parentSpanId?: string;
    traceparent: string;
  } {
    let traceparentHeader: string | undefined;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === 'traceparent') {
          traceparentHeader = Array.isArray(v) ? v[0] : v;
          break;
        }
      }
    }

    const parsed = this.parseTraceparent(traceparentHeader);
    const traceId = parsed?.traceId || this.generateTraceId();
    const parentSpanId = parsed?.parentSpanId;
    const currentSpanId = this.generateSpanId();
    const traceparent = this.formatTraceparent(traceId, currentSpanId);

    return { traceId, parentSpanId, traceparent };
  }
}

/**
 * Factory for OpenTelemetry Distributed Tracing Plugin
 */
export function createOpenTelemetryPlugin(options?: OpenTelemetryPluginOptions): JITPlugin & {
  tracer: OpenTelemetryTracer;
} {
  const tracer = new OpenTelemetryTracer(options);

  return {
    name: 'observability-opentelemetry',
    version: '1.4.3',
    description: 'W3C TraceContext distributed tracing plugin with spans for route matching, logic, and upstream proxy',
    tracer,

    async onRouteExecuted(event: JITRouteEvent) {
      // Record root request span for completed route event
      const span = tracer.startSpan(`jit.route.${event.route}`, {
        attributes: {
          'jit.route': event.route,
          'jit.phase': event.phase,
          'jit.duration_ms': event.durationMs,
          'jit.engine': event.engineUsed,
          'jit.ai_latency_ms': event.aiLatencyMs,
          'http.status_code': event.statusCode || (event.success ? 200 : 500),
        },
      });
      // Adjust start and end times to match the actual event duration
      span.endTime = event.timestamp;
      span.startTime = event.timestamp - event.durationMs;
      span.durationMs = event.durationMs;
      tracer.endSpan(span, event.success ? 'OK' : 'ERROR', event.error);
    },
  };
}
