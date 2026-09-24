import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UpstreamClient } from '../core/upstream_client.js';
import { RateLimiter } from '../core/rate_limiter.js';
import { TenantStore } from '../core/tenant_store.js';
import fs from 'fs';
import path from 'path';

describe('Upstream Proxy, SSRF Protection, Rate Limiter & Tenants', () => {
    const testSecretFile = path.resolve(process.cwd(), '.jit', 'test_upstream_secrets.json');
    const testTenantFile = path.resolve(process.cwd(), '.jit', 'test_tenants.json');

    beforeEach(() => {
        if (fs.existsSync(testSecretFile)) fs.rmSync(testSecretFile, { recursive: true, force: true });
        if (fs.existsSync(testTenantFile)) fs.rmSync(testTenantFile, { recursive: true, force: true });
    });

    afterEach(() => {
        if (fs.existsSync(testSecretFile)) fs.rmSync(testSecretFile, { recursive: true, force: true });
        if (fs.existsSync(testTenantFile)) fs.rmSync(testTenantFile, { recursive: true, force: true });
    });

    describe('UpstreamClient & SSRF Shield', () => {
        it('should block SSRF attacks on localhost, private IPs and cloud metadata', () => {
            const client = new UpstreamClient(testSecretFile);

            expect(() => client.assertSafeUrl('http://127.0.0.1:8080/admin')).toThrow('SSRF protection');
            expect(() => client.assertSafeUrl('http://localhost:3000/metrics')).toThrow('SSRF protection');
            expect(() => client.assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow('SSRF protection');
            expect(() => client.assertSafeUrl('http://10.0.0.1/private')).toThrow('SSRF protection');
            expect(() => client.assertSafeUrl('http://192.168.1.1/router')).toThrow('SSRF protection');
            expect(() => client.assertSafeUrl('http://172.16.5.1/cluster')).toThrow('SSRF protection');
        });

        it('should permit public HTTPS and HTTP URLs', () => {
            const client = new UpstreamClient(testSecretFile);
            expect(() => client.assertSafeUrl('https://api.github.com/repos')).not.toThrow();
            expect(() => client.assertSafeUrl('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001')).not.toThrow();
        });

        it('should resolve secrets from local store and environment variables with masking', () => {
            process.env.UPSTREAM_TDX_KEY = 'tdx_super_secret_token_1234';
            const client = new UpstreamClient(testSecretFile);

            // 1. Resolve from env
            const envSecret = client.resolveSecret('tdx_key');
            expect(envSecret).toBe('tdx_super_secret_token_1234');

            // 2. Save local secret
            client.saveSecret('cwa_weather', 'cwa_prod_api_token_9999');
            const localSecret = client.resolveSecret('cwa_weather');
            expect(localSecret).toBe('cwa_prod_api_token_9999');

            // 3. Masking
            const list = client.listSecrets();
            const tdxItem = list.find((s) => s.ref === 'tdx_key');
            expect(tdxItem?.source).toBe('env_or_hf_secrets');
            expect(tdxItem?.maskedValue).toContain('****');
            expect(tdxItem?.maskedValue).not.toContain('super_secret');

            delete process.env.UPSTREAM_TDX_KEY;
        });
    });

    describe('RateLimiter Engine', () => {
        it('should allow requests within rate limit and throttle when exceeded (429)', () => {
            const limiter = new RateLimiter();
            const tenantId = 'client_beta_001';
            const limit = { requestsPerMinute: 3 };

            // Request 1, 2, 3 should pass
            expect(limiter.checkRateLimit(tenantId, limit).allowed).toBe(true);
            expect(limiter.checkRateLimit(tenantId, limit).allowed).toBe(true);
            expect(limiter.checkRateLimit(tenantId, limit).allowed).toBe(true);

            // Request 4 should be throttled
            const throttled = limiter.checkRateLimit(tenantId, limit);
            expect(throttled.allowed).toBe(false);
            expect(throttled.error).toContain('請求頻率過高');
            expect(throttled.retryAfterSeconds).toBeDefined();
        });
    });

    describe('TenantStore & Multi-Tenant Authorization', () => {
        it('should issue API keys and enforce route permissions for Client vs PM', () => {
            const store = new TenantStore(testTenantFile);

            // 1. Client with specific routes
            const clientTenant = store.createTenant({
                name: 'ACME Corp',
                role: 'client',
                allowedRoutes: ['/api/weather', '/api/stock'],
                rateLimit: { requestsPerMinute: 30 },
            });

            expect(clientTenant.apiKey).toMatch(/^jit_client_/);
            expect(store.isRouteAllowed(clientTenant, '/api/weather')).toBe(true);
            expect(store.isRouteAllowed(clientTenant, '/api/stock')).toBe(true);
            expect(store.isRouteAllowed(clientTenant, '/api/admin/metrics')).toBe(false);

            // 2. PM with full permissions
            const pmTenant = store.createTenant({
                name: 'PM Alice',
                role: 'pm',
                allowedRoutes: ['*'],
            });

            expect(store.isRouteAllowed(pmTenant, '/api/weather')).toBe(true);
            expect(store.isRouteAllowed(pmTenant, '/api/admin/metrics')).toBe(true);
            expect(store.isRouteAllowed(pmTenant, '/api/any_experimental_endpoint')).toBe(true);

            // 3. Lookup by apiKey
            const found = store.findByApiKey(clientTenant.apiKey);
            expect(found).not.toBeNull();
            expect(found?.id).toBe(clientTenant.id);
        });
    });
});
