import { describe, it, expect } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { TypeSafeRouter } from '../core/typesafe_router.js';
import { UnauthorizedError } from '../core/types.js';

describe('S2: Spec Authentication (## Auth block)', () => {
    it('should parse bearer auth definition correctly', () => {
        const md = `# API: secure_data
Version: 1.0.0

## Auth
type: bearer
token: secret-token-123

## Logic
\`\`\`javascript
return { status: "ok" };
\`\`\`
`;
        const spec = MDParser.parse(md, 'secure.api.md');
        const route = MDParser.toRouteDefinition(spec);
        expect(route.auth).toBeDefined();
        expect(route.auth?.type).toBe('bearer');
        expect(route.auth?.token).toBe('secret-token-123');
    });

    it('should enforce Bearer token and throw UnauthorizedError if missing or invalid', async () => {
        const md = `# API: secure_bearer
Version: 1.0.0

## Auth
type: bearer
token: my-secret-jwt

## Logic
\`\`\`javascript
return { success: true };
\`\`\`
`;
        const spec = MDParser.parse(md, 'bearer.api.md');
        const route = MDParser.toRouteDefinition(spec);
        const router = new TypeSafeRouter();
        router.register(route);

        // Missing auth header
        await expect(router.handle({}, 'secure_bearer', {})).rejects.toThrow(UnauthorizedError);

        // Invalid Bearer token
        await expect(router.handle({}, 'secure_bearer', {
            authorization: 'Bearer wrong-token'
        })).rejects.toThrow(UnauthorizedError);

        // Valid Bearer token
        const response = await router.handle({}, 'secure_bearer', {
            authorization: 'Bearer my-secret-jwt'
        });
        expect(response.result).toEqual({ success: true });
    });

    it('should enforce API Key with custom header and envVar lookup', async () => {
        process.env.TEST_API_KEY = 'prod-key-xyz';

        const md = `# API: secure_apikey
Version: 1.0.0

## Auth
type: api-key
header: x-service-key
envVar: TEST_API_KEY

## Logic
\`\`\`javascript
return { authorized: true };
\`\`\`
`;
        const spec = MDParser.parse(md, 'apikey.api.md');
        const route = MDParser.toRouteDefinition(spec);
        const router = new TypeSafeRouter();
        router.register(route);

        // Missing custom header
        await expect(router.handle({}, 'secure_apikey', {})).rejects.toThrow(UnauthorizedError);

        // Wrong custom header value
        await expect(router.handle({}, 'secure_apikey', {
            'x-service-key': 'bad-key'
        })).rejects.toThrow(UnauthorizedError);

        // Correct key
        const response = await router.handle({}, 'secure_apikey', {
            'x-service-key': 'prod-key-xyz'
        });
        expect(response.result).toEqual({ authorized: true });

        delete process.env.TEST_API_KEY;
    });

    it('should allow unauthenticated requests when no ## Auth block is defined', async () => {
        const md = `# API: public_ping
Version: 1.0.0

## Logic
\`\`\`javascript
return { pong: true };
\`\`\`
`;
        const spec = MDParser.parse(md, 'public.api.md');
        const route = MDParser.toRouteDefinition(spec);
        const router = new TypeSafeRouter();
        router.register(route);

        const response = await router.handle({}, 'public_ping', {});
        expect(response.result).toEqual({ pong: true });
    });
});
