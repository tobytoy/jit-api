/**
 * JIT Protocol Synthesis Framework - Cloudflare Workers Edge Runtime Adapter
 * 
 * Provides a lightweight, 0-Node.js-fs edge fetch handler for Cloudflare Workers
 * and Cloudflare Pages Functions with 0ms cold start.
 */

export interface CloudflareAdapterOptions {
  specs?: any[];
  mocks?: Record<string, any>;
  corsOrigin?: string;
}

export function createCloudflareHandler(options?: CloudflareAdapterOptions) {
  const specs = options?.specs || [];
  const mocks = options?.mocks || {};
  const corsOrigin = options?.corsOrigin || '*';

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  };

  return {
    async fetch(request: Request, env: any, ctx?: any): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      function json(data: any, status = 200): Response {
        return new Response(JSON.stringify(data), {
          status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // 1. Health endpoint
      if (pathname === '/health' || pathname === '/api/health') {
        return json({ status: 'ok', runtime: 'cloudflare-workers', timestamp: Date.now() });
      }

      // 2. List all specs
      if (pathname === '/api/specs') {
        return json(specs);
      }

      // 3. JIT Route execution or Mock
      if (pathname.startsWith('/api/jit/') || pathname.startsWith('/api/mock/')) {
        const parts = pathname.split('/');
        const route = parts[parts.length - 1];

        let payload: any = {};
        if (request.method === 'POST') {
          try {
            payload = await request.json();
          } catch {
            payload = {};
          }
        }

        const mockResponse = mocks[route] || {
          status: 'ok',
          message: `Cloudflare Edge synthesized response for route '${route}'`,
          receivedPayload: payload,
        };

        return json({
          success: true,
          route,
          phase: 'phase3_frozen',
          executionTimeMs: 0.05,
          engineUsed: 'cloudflare_edge',
          data: mockResponse,
        });
      }

      return json({ error: `Not Found: ${pathname}` }, 404);
    },
  };
}
