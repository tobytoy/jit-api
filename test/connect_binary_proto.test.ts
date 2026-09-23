import express from 'express';
import http from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConnectAdapter } from '../core/connect_adapter.js';
import { JITEngine } from '../core/jit_engine.js';
import { RouteDefinition } from '../core/types.js';

describe('Optimization 5: ConnectRPC Binary Protobuf & Framing', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let engine: JITEngine;

  beforeAll(async () => {
    app = express();
    // Support raw buffer for binary proto requests
    app.use(express.raw({ type: ['*/*'], limit: '10mb' }));

    engine = new JITEngine({
      forceNeedle: true,
      stabilityThreshold: 2,
    });

    const routeDef: RouteDefinition = {
      route: 'create_item',
      description: 'Create inventory item',
      intentCriteria: 'Create item',
      handler: async (payload) => ({
        itemId: 'ITEM-99',
        name: payload.name,
        price: payload.price,
      }),
    };

    engine.register(routeDef);
    ConnectAdapter.attachToExpress(app, engine);

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

  it('should correctly encode and decode 5-byte Connect envelope frames', () => {
    const original = Buffer.from('hello-connect-proto', 'utf-8');
    const framed = ConnectAdapter.encodeFrame(original, 0);

    expect(framed.length).toBe(5 + original.length);
    expect(framed.readUInt8(0)).toBe(0); // flag
    expect(framed.readUInt32BE(1)).toBe(original.length); // length

    const decoded = ConnectAdapter.decodeFrame(framed);
    expect(decoded.flags).toBe(0);
    expect(decoded.data.toString('utf-8')).toBe('hello-connect-proto');
  });

  it('should process binary framed payload and return application/connect+proto binary response', async () => {
    const rawJsonPayload = JSON.stringify({ name: 'Mechanical Keyboard', price: 120 });
    const binaryFrame = ConnectAdapter.encodeFrame(Buffer.from(rawJsonPayload, 'utf-8'), 0);

    const res = await fetch(`${baseUrl}/jit.v1.JITService/CreateItem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/connect+proto',
        'Accept': 'application/connect+proto',
      },
      body: new Uint8Array(binaryFrame),
    });


    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/connect+proto');
    expect(res.headers.get('connect-protocol-version')).toBe('1');

    // Decode response frame
    const arrayBuf = await res.arrayBuffer();
    const resBodyBuffer = Buffer.from(arrayBuf);
    const decodedRes = ConnectAdapter.decodeFrame(resBodyBuffer);
    const resData = JSON.parse(decodedRes.data.toString('utf-8'));

    expect(resData.itemId).toBe('ITEM-99');
    expect(resData.name).toBe('Mechanical Keyboard');
    expect(resData._jit.phase).toBeDefined();
  });
});
