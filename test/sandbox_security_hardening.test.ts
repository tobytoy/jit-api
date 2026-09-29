import { describe, it, expect } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { SpecSecurityLinter } from '../plugins/guard_spec_linter.js';
import { JITRequestContext } from '../core/types.js';

describe('Sandbox & Logic Security Hardening (RCE & Prototype Climbing Defense)', () => {
  const dummyCtx: JITRequestContext = {
    route: '/api/test',
    phase: 'phase1_dynamic',
    executionTimeMs: 0,
    aiLatencyMs: 0,
    intentConfidence: 1.0,
    engineUsed: 'needle',
  };

  describe('Runtime VM Sandbox Prototype Isolation', () => {
    it('should block prototype constructor escape attempts in ## Logic', async () => {
      const maliciousSpec = MDParser.parse(`
# POST /api/exploit
Description: Attempting sandbox escape via constructor

## Logic
\`\`\`javascript
return payload.constructor.constructor("return process")();
\`\`\`
`);

      const routeDef = MDParser.toRouteDefinition(maliciousSpec);

      await expect(routeDef.handler({ item: 'test' }, { ...dummyCtx, route: '/api/exploit' })).rejects.toThrow(
        /Code generation from strings disallowed for this context|Cannot read properties of undefined/
      );
    });

    it('should block object literal constructor climbing in ## Logic', async () => {
      const maliciousSpec = MDParser.parse(`
# POST /api/exploit-obj
Description: Attempting sandbox escape via object literal constructor

## Logic
\`\`\`javascript
const obj = {};
return obj.constructor.constructor("return process")();
\`\`\`
`);

      const routeDef = MDParser.toRouteDefinition(maliciousSpec);

      await expect(routeDef.handler({}, { ...dummyCtx, route: '/api/exploit-obj' })).rejects.toThrow(
        /Code generation from strings disallowed for this context/
      );
    });

    it('should keep top-level this undefined inside strict wrapper to neutralize this.constructor', async () => {
      const spec = MDParser.parse(`
# POST /api/check-this
Description: Check top-level this in strict sandbox

## Logic
\`\`\`javascript
return typeof this;
\`\`\`
`);

      const routeDef = MDParser.toRouteDefinition(spec);
      const res = await routeDef.handler({}, { ...dummyCtx, route: '/api/check-this' });

      expect(res).toBe('undefined');
    });

    it('should safely execute legitimate logic with calculations without false alarms', async () => {
      const legitSpec = MDParser.parse(`
# POST /api/calc
Description: Legitimate tax calculation

## Logic
\`\`\`javascript
const subtotal = payload.price * payload.quantity;
const tax = Math.round(subtotal * 0.05);
return {
  subtotal,
  tax,
  total: subtotal + tax,
  timestamp: new Date().toISOString()
};
\`\`\`
`);

      const routeDef = MDParser.toRouteDefinition(legitSpec);
      const res = await routeDef.handler({ price: 100, quantity: 3 }, { ...dummyCtx, route: '/api/calc' });

      expect(res.subtotal).toBe(300);
      expect(res.tax).toBe(15);
      expect(res.total).toBe(315);
      expect(typeof res.timestamp).toBe('string');
    });
  });

  describe('Static SAST Security Linter (SEC-006 De-obfuscation & Anti-Escape)', () => {
    const linter = new SpecSecurityLinter();

    it('should catch obfuscated child_process string concatenation', () => {
      const content = `
# POST /api/backdoor
Description: Sneaky backdoor with string splitting

## Logic
\`\`\`javascript
const cp = 'child_' + 'process';
\`\`\`
`;
      const findings = linter.auditSpec(content, 'backdoor.api.md');
      const sec006 = findings.find((f) => f.ruleId === 'SEC-006');
      expect(sec006).toBeDefined();
      expect(sec006?.message).toContain('Obfuscated child_process string concatenation');
    });

    it('should catch obfuscated constructor string concatenation', () => {
      const content = `
# POST /api/backdoor2
Description: Sneaky constructor climbing

## Logic
\`\`\`javascript
const c = 'con' + 'structor';
\`\`\`
`;
      const findings = linter.auditSpec(content, 'backdoor2.api.md');
      const sec006 = findings.find((f) => f.ruleId === 'SEC-006');
      expect(sec006).toBeDefined();
      expect(sec006?.message).toContain('Obfuscated constructor string concatenation');
    });

    it('should catch prototype climbing and globalThis access', () => {
      const content = `
# POST /api/backdoor3
Description: Prototype access

## Logic
\`\`\`javascript
const proto = payload.__proto__;
const g = globalThis;
\`\`\`
`;
      const findings = linter.auditSpec(content, 'backdoor3.api.md');
      const protoFinding = findings.find((f) => f.sample?.includes('__proto__'));
      expect(protoFinding).toBeDefined();
      expect(protoFinding?.message).toContain('prototype climbing');

      const globalFinding = findings.find((f) => f.sample?.includes('globalThis'));
      expect(globalFinding).toBeDefined();
      expect(globalFinding?.message).toContain('Global scope access attempt');
    });

    it('should catch dynamic decoding via atob', () => {
      const content = `
# POST /api/backdoor4
Description: Dynamic unpacking

## Logic
\`\`\`javascript
const code = atob('Y2hpbGRfcHJvY2Vzcw==');
\`\`\`
`;
      const findings = linter.auditSpec(content, 'backdoor4.api.md');
      const atobFinding = findings.find((f) => f.sample?.includes('atob'));
      expect(atobFinding).toBeDefined();
      expect(atobFinding?.message).toContain('Obfuscated payload decoding');
    });
  });
});
