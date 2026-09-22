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

  it('should parse Version, Stage, and explicit ## Sample block', () => {
    const mdWithSample = `
# API: user_checkout
Version: 2.1.0
Stage: prod
> 結帳測試 API

## Intent
User wants to checkout cart

## Fields
- cartId: string (購物車 ID)
- amount: number (總額)

## Sample
- Semantic: 我要結帳購物車 CART-7788，金額 5000 元
- Payload:
\`\`\`json
{
  "cartId": "CART-7788",
  "amount": 5000
}
\`\`\`

## Mock
\`\`\`json
{ "status": "CHECKOUT_SUCCESS" }
\`\`\`
    `.trim();

    const spec = MDParser.parse(mdWithSample);
    expect(spec.version).toBe('2.1.0');
    expect(spec.stage).toBe('prod');
    expect(spec.sampleSemantic).toBe('我要結帳購物車 CART-7788，金額 5000 元');
    expect(spec.samplePayload).toEqual({ cartId: 'CART-7788', amount: 5000 });

    const routeDef = MDParser.toRouteDefinition(spec);
    expect(routeDef.version).toBe('2.1.0');
    expect(routeDef.stage).toBe('prod');
    expect(routeDef.samplePayload).toEqual({ cartId: 'CART-7788', amount: 5000 });
  });

  it('should generate smart fallback sample when ## Sample block is omitted', () => {
    const mdWithoutSample = `
# API: send_notification
> 發送推播通知

## Intent
User wants to send push notification

## Fields
- userId: string (用戶識別碼)
- priority: enum (等級)
  - HIGH: 高優先級
  - LOW: 低優先級
- isUrgent: boolean (是否緊急)
- retryCount: number (重試次數)
    `.trim();

    const spec = MDParser.parse(mdWithoutSample);
    expect(spec.version).toBe('1.0.0');
    expect(spec.stage).toBe('dev'); // default is dev
    expect(spec.samplePayload).toBeDefined();
    expect(spec.samplePayload?.userId).toContain('USERID');
    expect(spec.samplePayload?.priority).toBe('HIGH');
    expect(spec.samplePayload?.isUrgent).toBe(true);
    expect(spec.samplePayload?.retryCount).toBeDefined();
  });

  it('should support stage filtering, snapshot release, and rollback', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('specs');

    // Test stage filtering
    const allSpecs = loader.listSpecs('all');
    expect(allSpecs.length).toBeGreaterThanOrEqual(2);

    // Snapshot release
    const testVer = 'v9.9.9';
    const release = loader.snapshotRelease(testVer, 'Test release');
    expect(release.version).toBe(testVer);
    expect(release.specsCount).toBeGreaterThanOrEqual(2);

    const releases = loader.listReleases();
    expect(releases.some((r) => r.version === testVer)).toBe(true);

    // Rollback test
    const rollbackResult = loader.rollback(testVer, engine);
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.restoredCount).toBeGreaterThanOrEqual(2);

    // Clean up test release dir
    import('fs').then((fs) => {
      import('path').then((path) => {
        const testDir = path.resolve('.jit', 'releases', testVer);
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });
    });
  });
});
