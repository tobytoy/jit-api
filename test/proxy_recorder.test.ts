import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProxyRecorder } from '../core/proxy_recorder.js';

describe('Smart Proxy Recorder & Digital Twin (Record & Offline Failover)', () => {
  let realServer: http.Server;
  let realBackendUrl: string;
  let proxy: ProxyRecorder;
  let proxyUrl: string;
  const testSpecsDir = path.resolve(process.cwd(), '.jit', 'test_proxy_specs');

  beforeAll(async () => {
    if (fs.existsSync(testSpecsDir)) {
      fs.rmSync(testSpecsDir, { recursive: true, force: true });
    }

    // 1. Setup a Real Backend Server
    const realApp = express();
    realApp.use(express.json());
    realApp.post('/api/orders', (req, res) => {
      res.json({
        order_id: 'REAL-ORD-12345',
        item: req.body.item,
        price: 99.99,
        status: 'PAID_ON_REAL_BACKEND',
      });
    });

    await new Promise<void>((resolve) => {
      realServer = realApp.listen(0, () => {
        const addr = realServer.address() as any;
        realBackendUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });

    // 2. Setup ProxyRecorder pointing to Real Backend
    proxy = new ProxyRecorder({
      targetUrl: realBackendUrl,
      port: 0,
      specsDir: testSpecsDir,
      stabilityThreshold: 3,
      autoFailover: true,
    });

    proxyUrl = await proxy.start();
  });

  afterAll(async () => {
    await proxy.stop();
    if (realServer.listening) {
      await new Promise<void>((resolve) => realServer.close(() => resolve()));
    }
    if (fs.existsSync(testSpecsDir)) {
      fs.rmSync(testSpecsDir, { recursive: true, force: true });
    }
  });

  it('should forward traffic, record request/response, and auto-crystallize spec after 3 calls', async () => {
    const payload = { item: 'Wireless Headphones' };

    // Request 1: Forwarded & Recorded
    const res1 = await fetch(`${proxyUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(res1.headers.get('x-jit-proxy')).toBe('recorded');
    expect(body1.order_id).toBe('REAL-ORD-12345');
    expect(body1.status).toBe('PAID_ON_REAL_BACKEND');

    // Request 2
    await fetch(`${proxyUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Request 3: Hits stability threshold -> triggers freeze & spec generation
    const res3 = await fetch(`${proxyUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res3.status).toBe(200);

    // Verify auto-generated spec exists on disk
    const recordedFile = path.join(testSpecsDir, 'recorded_api_orders.api.md');
    expect(fs.existsSync(recordedFile)).toBe(true);

    const specContent = fs.readFileSync(recordedFile, 'utf-8');
    expect(specContent).toContain('# API: api_orders');
    expect(specContent).toContain('item: string');
    expect(specContent).toContain('REAL-ORD-12345');
  });

  it('should auto-failover to Digital Twin when real backend server goes down', async () => {
    // Shutdown the real backend server!
    await new Promise<void>((resolve) => realServer.close(() => resolve()));

    // Send request 4: Real backend is DEAD, but JIT Proxy fails over to Digital Twin!
    const res4 = await fetch(`${proxyUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'Wireless Headphones' }),
    });

    expect(res4.status).toBe(200);
    expect(res4.headers.get('x-jit-digital-twin')).toBe('true');
    expect(res4.headers.get('x-jit-reason')).toBe('failover');

    const body4 = await res4.json();
    expect(body4._digital_twin).toBe(true);
    expect(body4.order_id).toBe('REAL-ORD-12345');
    expect(body4.status).toBe('PAID_ON_REAL_BACKEND');
  });
});
