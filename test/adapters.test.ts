import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createCloudflareHandler } from '../adapters/cloudflare_worker.js';
import { createFirebaseHandler } from '../adapters/firebase_handler.js';
import { OpenAPIExporter } from '../adapters/openapi_exporter.js';
import { StaticPagesExporter } from '../adapters/static_exporter.js';
import { ProjectScaffolder } from '../adapters/scaffolder.js';

describe('JIT Deployment Adapters Suite', () => {
  const tempTestDir = path.resolve(process.cwd(), './.jit_test_temp');

  afterEach(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe('Cloudflare Workers Adapter', () => {
    const handler = createCloudflareHandler({
      specs: [{ route: 'test_route', description: 'Testing' }],
      mocks: {
        test_route: { id: 123, status: 'MOCK_OK' },
      },
    });

    it('should respond to CORS OPTIONS preflight', async () => {
      const req = new Request('http://localhost/api/jit/test_route', { method: 'OPTIONS' });
      const res = await handler.fetch(req, {});
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle /health endpoint', async () => {
      const req = new Request('http://localhost/health');
      const res = await handler.fetch(req, {});
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.runtime).toBe('cloudflare-workers');
    });

    it('should return specs at /api/specs', async () => {
      const req = new Request('http://localhost/api/specs');
      const res = await handler.fetch(req, {});
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].route).toBe('test_route');
    });

    it('should synthesize mock response at /api/jit/:route', async () => {
      const req = new Request('http://localhost/api/jit/test_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      const res = await handler.fetch(req, {});
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.route).toBe('test_route');
      expect(body.data).toEqual({ id: 123, status: 'MOCK_OK' });
    });
  });

  describe('Firebase Functions Adapter', () => {
    it('should wrap Express app with CORS support', async () => {
      let handled = false;
      const mockApp = (req: any, res: any) => {
        handled = true;
        res.status(200).json({ status: 'firebase_ok' });
      };

      const handler = createFirebaseHandler(mockApp, { cors: true });
      const mockReq = { method: 'GET' };
      const headersSent: Record<string, string> = {};
      const mockRes = {
        set: (k: string, v: string) => { headersSent[k] = v; },
        status: (code: number) => ({ json: (d: any) => d }),
      };

      handler(mockReq, mockRes);
      expect(handled).toBe(true);
      expect(headersSent['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('OpenAPI 3.0 Exporter', () => {
    it('should export valid OpenAPI 3.0 document from specs directory', () => {
      const outFile = path.join(tempTestDir, 'openapi.json');
      const spec = OpenAPIExporter.export({
        specsDir: './specs',
        outFile,
        title: 'Test JIT API',
      });

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Test JIT API');
      expect(spec.paths).toBeDefined();
      expect(fs.existsSync(outFile)).toBe(true);
    });
  });

  describe('Static Pages Exporter', () => {
    it('should generate static bundle with runtime interceptor and workflow', async () => {
      const outDir = path.join(tempTestDir, 'dist-pages');
      const result = await StaticPagesExporter.export({
        specsDir: './specs',
        publicDir: './public',
        outDir,
        generateGithubWorkflow: false,
      });

      expect(result.specCount).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(outDir, 'jit-static-data.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'jit-static-runtime.js'))).toBe(true);

      const staticData = JSON.parse(fs.readFileSync(path.join(outDir, 'jit-static-data.json'), 'utf-8'));
      expect(Array.isArray(staticData.specs)).toBe(true);
      expect(staticData.mocks).toBeDefined();
    });
  });

  describe('Project Scaffolder', () => {
    it('should scaffold LINE Mini App (LIFF) preset', async () => {
      const outDir = path.join(tempTestDir, 'liff-app');
      const res = await ProjectScaffolder.scaffold({
        preset: 'line-liff',
        outDir,
        liffId: 'TEST-LIFF-123',
      });

      expect(fs.existsSync(path.join(outDir, 'public/index.html'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'public/liff-app.js'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'specs/member_points.api.md'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'README.md'))).toBe(true);

      const indexHtml = fs.readFileSync(path.join(outDir, 'public/index.html'), 'utf-8');
      expect(indexHtml).toContain('TEST-LIFF-123');
    });

    it('should scaffold Cloudflare Workers preset', async () => {
      const outDir = path.join(tempTestDir, 'cf-app');
      await ProjectScaffolder.scaffold({ preset: 'cloudflare', outDir });

      expect(fs.existsSync(path.join(outDir, 'wrangler.toml'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'src/worker.ts'))).toBe(true);
    });

    it('should scaffold Firebase Functions preset', async () => {
      const outDir = path.join(tempTestDir, 'fb-app');
      await ProjectScaffolder.scaffold({ preset: 'firebase', outDir });

      expect(fs.existsSync(path.join(outDir, 'firebase.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'functions/index.js'))).toBe(true);
    });

    it('should scaffold Supabase integration preset', async () => {
      const outDir = path.join(tempTestDir, 'sb-app');
      await ProjectScaffolder.scaffold({ preset: 'supabase', outDir });

      expect(fs.existsSync(path.join(outDir, 'supabase/schema.sql'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'jit.config.js'))).toBe(true);
    });
  });
});
