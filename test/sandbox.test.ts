import { describe, it, expect } from 'vitest';
import { MDParser } from '../core/md_parser.js';

describe('S1 & U2: Node.js VM Sandbox & Line Number Tracing', () => {
    it('should block access to process and process.env', async () => {
        const md = `# API: test_leak
Version: 1.0.0

## Intent
Leak environment variables

## Logic
\`\`\`javascript
return {
    hasProcess: typeof process !== 'undefined',
    env: typeof process !== 'undefined' ? process.env : null
};
\`\`\`
`;
        const spec = MDParser.parse(md, 'test_leak.api.md');
        const route = MDParser.toRouteDefinition(spec);
        const result = await route.handler({} as any, {} as any);
        expect(result.hasProcess).toBe(false);
        expect(result.env).toBeNull();
    });

    it('should block require and import in logic', async () => {
        const md = `# API: test_rce
Version: 1.0.0

## Intent
Attempt RCE via require

## Logic
\`\`\`javascript
const fs = require('fs');
return { fs: typeof fs };
\`\`\`
`;
        const spec = MDParser.parse(md, 'test_rce.api.md');
        const route = MDParser.toRouteDefinition(spec);
        await expect(route.handler({} as any, {} as any)).rejects.toThrow(/require/i);
    });

    it('should block eval and dynamic code generation from strings', async () => {
        const md = `# API: test_eval
Version: 1.0.0

## Intent
Attempt eval execution

## Logic
\`\`\`javascript
const evil = eval('1 + 1');
return { evil };
\`\`\`
`;
        const spec = MDParser.parse(md, 'test_eval.api.md');
        const route = MDParser.toRouteDefinition(spec);
        await expect(route.handler({} as any, {} as any)).rejects.toThrow();
    });

    it('should terminate infinite loops with timeout', async () => {
        const md = `# API: test_dos
Version: 1.0.0

## Intent
Denial of service via infinite loop

## Logic
\`\`\`javascript
while (true) {
    // infinite loop
}
return { done: true };
\`\`\`
`;
        const spec = MDParser.parse(md, 'test_dos.api.md');
        const route = MDParser.toRouteDefinition(spec);
        await expect(route.handler({} as any, {} as any)).rejects.toThrow(/timed out/i);
    }, 10000);

    it('should accurately report Markdown source line numbers on error', async () => {
        const md = `# API: test_error_line
Version: 1.0.0

## Intent
Test line number error trace

## Logic
\`\`\`javascript
const a = 1;
const b = 2;
throw new Error("Boom inside logic");
\`\`\`
`;
        const spec = MDParser.parse(md, 'error_spec.api.md');
        const route = MDParser.toRouteDefinition(spec);
        try {
            await route.handler({} as any, {} as any);
            expect.fail('Should have thrown an error');
        } catch (err: any) {
            expect(err.message).toContain('Boom inside logic');
            expect(err.stack).toMatch(/error_spec\.api\.md:\d+/);
        }
    });
});
