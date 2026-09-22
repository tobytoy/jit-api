import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom Metrics
const reqDuration = new Trend('custom_req_duration');
const successRate = new Rate('custom_success_rate');
const totalCounter = new Counter('custom_total_requests');

// Configuration from environment variables
const BASE_URL = __ENV.K6_URL || 'http://127.0.0.1:3005/api/jit';
const TEST_MODE = __ENV.K6_MODE || 'phase3'; // 'phase1' | 'phase3'
const VUS = parseInt(__ENV.K6_VUS || '10', 10);
const DURATION = __ENV.K6_DURATION || '5s';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.05'], // failure rate < 5%
  },
};

export default function () {
  let payload;

  if (TEST_MODE === 'phase1') {
    // Phase 1: Natural language / loose dynamic payload requiring semantic routing
    payload = JSON.stringify({
      message: '我想訂購一台 iPad Pro 平板電腦，刷信用卡，金額是 29900 元',
      item: 'iPad Pro',
      amount: 29900,
      paymentMethod: 'CREDIT_CARD',
    });
  } else {
    // Phase 3: Static Fast-Path payload matching frozen schema (0ms AI latency)
    payload = JSON.stringify({
      route: 'create_order',
      item: 'Mechanical Keyboard',
      amount: 3200,
      paymentMethod: 'LINE_PAY',
    });
  }

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Benchmark-Mode': TEST_MODE,
    },
    timeout: '10s',
  };

  const start = Date.now();
  const res = http.post(BASE_URL, payload, params);
  const latency = Date.now() - start;

  reqDuration.add(latency);
  totalCounter.add(1);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'has data or success': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true || !!body.data;
      } catch {
        return false;
      }
    },
  });

  successRate.add(passed);

  // Slight sleep to maintain realistic traffic
  sleep(0.01);
}
