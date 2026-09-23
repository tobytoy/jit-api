import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { JITEngine } from '../core/jit_engine.js';
import { MDLoader } from '../core/md_loader.js';
import { ConnectAdapter } from '../core/connect_adapter.js';

describe('ConnectRPC Adapter (Triple-Protocol: Connect / gRPC-Web / gRPC)', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let engine: JITEngine;
  let mdLoader: MDLoader;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    engine = new JITEngine({
      stabilityThreshold: 2,
    });
    mdLoader = new MDLoader('specs');
    mdLoader.loadAll(engine, 'all');

    ConnectAdapter.attachToExpress(app, engine, mdLoader, {
      serviceName: 'jit.v1.JITService',
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should correctly convert PascalCase and snake_case route names', () => {
    expect(ConnectAdapter.toPascalCase('create_order')).toBe('CreateOrder');
    expect(ConnectAdapter.toPascalCase('date-converter')).toBe('DateConverter');
    expect(ConnectAdapter.toSnakeCase('CreateOrder')).toBe('create_order');
    expect(ConnectAdapter.toSnakeCase('ProcessRefund')).toBe('process_refund');
  });

  it('should return service reflection metadata on GET /jit.v1.JITService', async () => {
    const res = await fetch(`${baseUrl}/jit.v1.JITService`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.service).toBe('jit.v1.JITService');
    expect(body.protocol).toBe('ConnectRPC v1');
    expect(body.methods.length).toBeGreaterThan(0);

    const executeMethod = body.methods.find((m: any) => m.method === 'Execute');
    expect(executeMethod).toBeDefined();

    const orderMethod = body.methods.find((m: any) => m.method === 'CreateOrder');
    expect(orderMethod).toBeDefined();
    expect(orderMethod.path).toBe('/jit.v1.JITService/CreateOrder');
  });

  it('should execute universal RPC via POST /jit.v1.JITService/Execute', async () => {
    const res = await fetch(`${baseUrl}/jit.v1.JITService/Execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({
        route: 'create_order',
        payload: {
          item: 'Mechanical Keyboard',
          amount: 3500,
          paymentMethod: 'CREDIT_CARD',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('connect-protocol-version')).toBe('1');
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.item).toBe('Mechanical Keyboard');
    expect(body.data.amount).toBe(3500);
    expect(body.data.status).toBe('CONFIRMED');
    expect(body.context.route).toBe('create_order');
  });

  it('should execute direct typed RPC via POST /jit.v1.JITService/CreateOrder', async () => {
    const res = await fetch(`${baseUrl}/jit.v1.JITService/CreateOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({
        item: 'Studio Display',
        amount: 45000,
        paymentMethod: 'APPLE_PAY',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('connect-protocol-version')).toBe('1');

    const body = await res.json();
    expect(body.item).toBe('Studio Display');
    expect(body.amount).toBe(45000);
    expect(body.payment_method).toBe('APPLE_PAY');
    expect(body.status).toBe('CONFIRMED');
    expect(body._jit).toBeDefined();
    expect(body._jit.phase).toBeDefined();
  });

  it('should return 404 invalid Connect error for unknown method', async () => {
    const res = await fetch(`${baseUrl}/jit.v1.JITService/NonExistentServiceMethod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('not_found');
    expect(body.message).toContain('not found');
  });

  it('should support Phase 3 static fast-path execution over ConnectRPC', async () => {
    // Send repeated stable payloads to freeze create_order (threshold = 2)
    const payload = {
      item: 'Mac Mini M4',
      amount: 19900,
      paymentMethod: 'LINE_PAY',
    };

    await fetch(`${baseUrl}/jit.v1.JITService/CreateOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    await fetch(`${baseUrl}/jit.v1.JITService/CreateOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Check if route is now frozen
    const isFrozen = engine.getObserver().isFrozen('create_order');
    expect(isFrozen).toBe(true);

    // Call frozen route via ConnectRPC: should execute in Phase 3 with 0ms AI Latency!
    const frozenRes = await fetch(`${baseUrl}/jit.v1.JITService/CreateOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({
        item: 'Mac Mini M4 Pro',
        amount: 39900,
        paymentMethod: 'CREDIT_CARD',
      }),
    });

    expect(frozenRes.status).toBe(200);
    const body = await frozenRes.json();
    expect(body.item).toBe('Mac Mini M4 Pro');
    expect(body.amount).toBe(39900);
    expect(body.phase).toBe('phase3_frozen');
    expect(body.ai_latency_ms).toBe(0);
  });
});
