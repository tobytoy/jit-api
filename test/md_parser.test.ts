import { describe, it, expect } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { MDLoader } from '../core/md_loader.js';
import { JITEngine } from '../core/jit_engine.js';

describe('Markdown API (MD-API) Parser & Loader', () => {
  const sampleMarkdown = `
# API: user_signup
> 處理新會員註冊

## Intent
User wants to register, sign up, or create a new account

## Fields
- email: string (使用者電子郵件)
- age: number (年齡)
- plan: enum (訂閱方案)
  - FREE: 免費方案
  - PRO: 專業會員方案
  - ENTERPRISE: 企業尊榮方案

## Logic
\`\`\`javascript
return {
  user_id: 'USR-999',
  email: payload.email,
  plan: payload.plan || 'FREE',
  welcome: true
};
\`\`\`
  `.trim();

  it('should parse markdown into structured specification', () => {
    const spec = MDParser.parse(sampleMarkdown);

    expect(spec.route).toBe('user_signup');
    expect(spec.description).toBe('處理新會員註冊');
    expect(spec.intentCriteria).toContain('register, sign up');
    expect(spec.fields.length).toBe(3);

    expect(spec.fields[0].name).toBe('email');
    expect(spec.fields[0].type).toBe('string');

    expect(spec.fields[2].name).toBe('plan');
    expect(spec.fields[2].type).toBe('enum');
    expect(spec.enumFields['plan']).toBeDefined();
    expect(spec.enumFields['plan']['PRO']).toBe('專業會員方案');

    expect(spec.logicCode).toContain("user_id: 'USR-999'");
  });

  it('should convert parsed spec into executable route definition and execute', async () => {
    const spec = MDParser.parse(sampleMarkdown);
    const routeDef = MDParser.toRouteDefinition(spec);

    expect(routeDef.route).toBe('user_signup');
    expect(routeDef.intentCriteria).toContain('register, sign up');

    const result = await routeDef.handler(
      { email: 'test@example.com', plan: 'PRO' },
      {
        route: 'user_signup',
        phase: 'phase1_dynamic',
        aiLatencyMs: 25,
        engineUsed: 'needle',
        executionTimeMs: 30,
        isFallback: false,
      }
    );

    expect(result.user_id).toBe('USR-999');
    expect(result.email).toBe('test@example.com');
    expect(result.plan).toBe('PRO');
  });

  it('should discover and load spec files using MDLoader', async () => {
    const engine = new JITEngine();
    const loader = new MDLoader('specs');
    const loaded = loader.loadAll(engine);

    expect(loaded.length).toBeGreaterThanOrEqual(2);
    const routes = loaded.map((s) => s.route);
    expect(routes).toContain('create_order');
    expect(routes).toContain('process_refund');

    // Verify engine has these routes registered
    const isRegistered = engine.getRoutes().some((r) => r.route === 'create_order');
    expect(isRegistered).toBe(true);
  });
});
