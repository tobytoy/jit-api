/**
 * JIT Protocol Synthesis Framework - Security Linter & Spec Guard Tests
 */

import { describe, it, expect } from 'vitest';
import {
  SpecSecurityLinter,
  createSecurityLinterPlugin,
} from '../plugins/guard_spec_linter.js';

describe('Security Linter & Spec Guard Plugin', () => {
  const linter = new SpecSecurityLinter();

  it('SEC-001: should detect hardcoded API keys and secrets in Markdown specs', () => {
    const markdownWithSecrets = `
# Create User API
## Route: \`/api/users\`

## Auth
- Type: apikey
- Key: sk-live-12345678901234567890abcdef

## Upstream
- Target: https://api.upstream.com
- Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDN7Pt
`;

    const findings = linter.auditSpec(markdownWithSecrets, 'insecure_spec.api.md');
    const secretFindings = findings.filter((f) => f.ruleId === 'SEC-001');

    expect(secretFindings.length).toBeGreaterThanOrEqual(1);
    expect(secretFindings[0].severity).toBe('critical');
    expect(secretFindings[0].remediation).toContain('${ENV_VAR}');
  });

  it('SEC-001: should NOT flag environment variable placeholders', () => {
    const secureMarkdown = `
# Secure API
## Route: \`/api/secure\`

## Auth
- Type: apikey
- Key: \${MY_API_KEY}

## Upstream
- Target: https://api.upstream.com
- Header: Authorization: Bearer \${LIVE_TOKEN}
`;

    const findings = linter.auditSpec(secureMarkdown, 'secure.api.md');
    const secretFindings = findings.filter((f) => f.ruleId === 'SEC-001');
    expect(secretFindings.length).toBe(0);
  });

  it('SEC-002: should detect SSRF and private network targets in Upstream / Notify', () => {
    const ssrfMarkdown = `
# Admin API
## Route: \`/api/admin/info\`

## Upstream
- Target: http://169.254.169.254/latest/meta-data/

## Notify
- Channel: webhook
- Target: http://127.0.0.1:6379
`;

    const findings = linter.auditSpec(ssrfMarkdown, 'ssrf.api.md');
    const ssrfFindings = findings.filter((f) => f.ruleId === 'SEC-002');

    expect(ssrfFindings.length).toBe(2);
    expect(ssrfFindings[0].severity).toBe('critical');
    expect(ssrfFindings[0].message).toContain('Cloud Metadata');
    expect(ssrfFindings[1].message).toContain('Localhost');
  });

  it('SEC-003: should warn about unprotected sensitive routes (missing ## Auth)', () => {
    const sensitiveMarkdown = `
# Delete Account API
## Route: \`/api/users/delete\`

## Fields
- userId: string
`;

    const findings = linter.auditSpec(sensitiveMarkdown, 'delete_user.api.md');
    const authFindings = findings.filter((f) => f.ruleId === 'SEC-003');

    expect(authFindings.length).toBe(1);
    expect(authFindings[0].severity).toBe('warning');
    expect(authFindings[0].message).toContain("Sensitive route '/api/users/delete' lacks a '## Auth'");
  });

  it('SEC-004: should note missing RateLimit on routes', () => {
    const specWithoutRateLimit = `
# Search API
## Route: \`/api/search\`
`;
    const findings = linter.auditSpec(specWithoutRateLimit, 'search.api.md');
    const rateLimitFindings = findings.filter((f) => f.ruleId === 'SEC-004');
    expect(rateLimitFindings.length).toBe(1);
    expect(rateLimitFindings[0].severity).toBe('info');
  });

  it('SEC-006: should flag dangerous system calls in code blocks', () => {
    const maliciousCodeMarkdown = `
# Custom Handler
## Route: \`/api/backup\`

## Code
\`\`\`javascript
const cp = require('child_process');
cp.execSync('rm -rf /tmp/data');
\`\`\`
`;

    const findings = linter.auditSpec(maliciousCodeMarkdown, 'danger.api.md');
    const codeFindings = findings.filter((f) => f.ruleId === 'SEC-006');

    expect(codeFindings.length).toBeGreaterThanOrEqual(1);
    expect(codeFindings[0].severity).toBe('critical');
  });

  it('should generate formatted terminal report', async () => {
    const report = await linter.auditDirectory('./specs');
    expect(report.scannedFiles).toBeGreaterThan(0);
    expect(report.passed).toBe(true);

    const formatted = linter.formatReport(report);
    expect(formatted).toContain('JIT API Security Audit & Spec Guard Report');
    expect(formatted).toContain('PASSED');
  });

  it('should instantiate security plugin', () => {
    const plugin = createSecurityLinterPlugin({ strictMode: false });
    expect(plugin.name).toBe('guard-spec-linter');
    expect(plugin.onInit).toBeDefined();
  });
});
