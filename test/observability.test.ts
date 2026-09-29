import { describe, it, expect } from 'vitest';
import {
  createPrometheusPlugin,
  PrometheusRegistry,
} from '../plugins/observability_prometheus.js';
import {
  createOpenTelemetryPlugin,
  OpenTelemetryTracer,
  InMemorySpanExporter,
} from '../plugins/observability_opentelemetry.js';

describe('Observability Suite (Prometheus & OpenTelemetry)', () => {
  describe('Prometheus Plugin & Metrics Exporter', () => {
    it('should record requests and export standard Prometheus OpenMetrics text format', () => {
      const plugin = createPrometheusPlugin({ prefix: 'jit_test' });

      // Record multiple requests across different phases and routes
      plugin.registry.recordRequest({
        route: '/api/orders',
        phase: 'phase1_dynamic',
        durationMs: 125,
        success: true,
        timestamp: Date.now(),
        engineUsed: 'typesafe',
        aiLatencyMs: 90,
      });

      plugin.registry.recordRequest({
        route: '/api/orders',
        phase: 'phase3_frozen',
        durationMs: 1.2,
        success: true,
        timestamp: Date.now(),
      });

      plugin.registry.recordRequest({
        route: '/api/orders',
        phase: 'phase3_frozen',
        durationMs: 2.5,
        success: false,
        timestamp: Date.now(),
      });

      plugin.registry.recordFreeze('/api/orders');
      plugin.registry.recordDrift('/api/orders');

      const metricsText = plugin.getMetricsAsText();

      // Verify Prometheus text structure
      expect(metricsText).toContain('# HELP jit_test_requests_total');
      expect(metricsText).toContain('# TYPE jit_test_requests_total counter');
      expect(metricsText).toContain('jit_test_requests_total{route="/api/orders",phase="phase1_dynamic",status="success"} 1');
      expect(metricsText).toContain('jit_test_requests_total{route="/api/orders",phase="phase3_frozen",status="success"} 1');
      expect(metricsText).toContain('jit_test_requests_total{route="/api/orders",phase="phase3_frozen",status="error"} 1');

      // Verify latency histogram & summary quantiles
      expect(metricsText).toContain('# HELP jit_test_request_duration_seconds');
      expect(metricsText).toContain('jit_test_request_duration_seconds_bucket');
      expect(metricsText).toContain('jit_test_request_duration_seconds_sum');
      expect(metricsText).toContain('jit_test_request_duration_seconds_count');

      // Verify P50/P90/P99 quantiles
      expect(metricsText).toContain('jit_test_request_duration_ms{route="/api/orders",phase="phase3_frozen",quantile="0.5"}');
      expect(metricsText).toContain('jit_test_request_duration_ms{route="/api/orders",phase="phase3_frozen",quantile="0.99"}');

      // Verify AI Latency
      expect(metricsText).toContain('# HELP jit_test_ai_latency_seconds');
      expect(metricsText).toContain('jit_test_ai_latency_seconds_bucket{engine="typesafe"');

      // Verify Gauges & Drift Counters
      expect(metricsText).toContain('jit_test_routes_frozen_total 1');
      expect(metricsText).toContain('jit_test_drift_detected_total{route="/api/orders"} 1');
    });

    it('should create an HTTP /metrics handler that responds with text/plain 0.0.4', () => {
      const plugin = createPrometheusPlugin();
      const handler = plugin.createMetricsHandler();

      let setHeaderKey = '';
      let setHeaderVal = '';
      let responseBody = '';

      const mockRes = {
        setHeader(k: string, v: string) {
          setHeaderKey = k;
          setHeaderVal = v;
        },
        end(body: string) {
          responseBody = body;
        },
      };

      handler({}, mockRes);

      expect(setHeaderKey).toBe('Content-Type');
      expect(setHeaderVal).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(responseBody).toContain('# HELP jit_requests_total');
    });
  });

  describe('OpenTelemetry Distributed Tracing Plugin', () => {
    it('should parse and generate W3C TraceContext traceparent headers', () => {
      const tracer = new OpenTelemetryTracer();
      const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      const parsed = tracer.parseTraceparent(validTraceparent);
      expect(parsed).not.toBeNull();
      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.parentSpanId).toBe('00f067aa0ba902b7');

      const formatted = tracer.formatTraceparent(parsed!.traceId, '1122334455667788');
      expect(formatted).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-1122334455667788-01');
    });

    it('should create spans, record timing & attributes, and export via InMemorySpanExporter', async () => {
      const exporter = new InMemorySpanExporter();
      const tracer = new OpenTelemetryTracer({ exporter });

      const traceContext = tracer.extractContextFromHeaders({
        traceparent: '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01',
      });

      expect(traceContext.traceId).toBe('0123456789abcdef0123456789abcdef');
      expect(traceContext.parentSpanId).toBe('fedcba9876543210');

      // Execute with instrumented span
      const res = await tracer.withSpan(
        'jit.logic_execution',
        {
          traceId: traceContext.traceId,
          parentSpanId: traceContext.parentSpanId,
          attributes: { 'jit.route': '/api/payment', 'jit.phase': 'phase1_dynamic' },
        },
        async (span) => {
          expect(span.name).toBe('jit.logic_execution');
          return { status: 'processed' };
        }
      );

      expect(res.status).toBe('processed');
      expect(exporter.spans.length).toBe(1);

      const recordedSpan = exporter.spans[0];
      expect(recordedSpan.name).toBe('jit.logic_execution');
      expect(recordedSpan.traceId).toBe('0123456789abcdef0123456789abcdef');
      expect(recordedSpan.parentSpanId).toBe('fedcba9876543210');
      expect(recordedSpan.status).toBe('OK');
      expect(recordedSpan.durationMs).toBeGreaterThanOrEqual(0);
      expect(recordedSpan.attributes['jit.route']).toBe('/api/payment');
    });

    it('should integrate seamlessly into JIT plugin lifecycle via onRouteExecuted', async () => {
      const exporter = new InMemorySpanExporter();
      const plugin = createOpenTelemetryPlugin({ exporter });

      await plugin.onRouteExecuted!({
        route: '/api/checkout',
        phase: 'phase3_frozen',
        durationMs: 4.8,
        success: true,
        timestamp: Date.now(),
        engineUsed: 'fastpath',
      });

      expect(exporter.spans.length).toBe(1);
      const span = exporter.spans[0];
      expect(span.name).toBe('jit.route./api/checkout');
      expect(span.status).toBe('OK');
      expect(span.attributes['jit.route']).toBe('/api/checkout');
      expect(span.attributes['jit.phase']).toBe('phase3_frozen');
      expect(span.attributes['jit.duration_ms']).toBe(4.8);
    });
  });
});
