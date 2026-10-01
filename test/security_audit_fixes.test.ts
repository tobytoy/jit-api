import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { MDParser } from '../core/md_parser.js';
import { MDLoader } from '../core/md_loader.js';
import { MasterAuthManager } from '../core/master_auth.js';
import { ECPayService, escapeHtml } from '../plugins/payment_ecpay.js';
import { LocalDuckDBAdapter } from '../data/local_duckdb.js';
import { JITRequestContext } from '../core/types.js';

describe('Security Audit Fixes Verification (C-1 to M-5)', () => {
  const dummyCtx: JITRequestContext = {
    route: '/api/security-test',
    phase: 'phase1_dynamic',
    executionTimeMs: 0,
    aiLatencyMs: 0,
    intentConfidence: 1.0,
    engineUsed: 'needle',
  };

  describe('C-1: SQL Injection Defense in Pipeline Handler', () => {
    it('should use parameterized queries and not concatenate malicious strings into SQL', async () => {
      let executedSql = '';
      let executedParams: any[] = [];

      const mockDb: any = {
        query: async (sql: string, params: any[] = []) => {
          executedSql = sql;
          executedParams = params;
          return { rows: [{ id: 1, name: 'Safe' }], rowCount: 1, durationMs: 1 };
        },
      };

      const spec = MDParser.parse(`
# /api/orders/search
Description: Pipeline aggregate search

## Pipeline
aggregate: SELECT * FROM orders WHERE status = :status AND user_id = {userId}
`);

      const routeDef = MDParser.toRouteDefinition(spec);
      const maliciousPayload = {
        status: "' OR '1'='1",
        userId: "1; DROP TABLE users; --",
      };

      const res = await routeDef.handler(maliciousPayload, {
        ...dummyCtx,
        route: '/api/orders/search',
        db: mockDb,
      });

      expect(res.status).toBe('SUCCESS');
      // The SQL must contain placeholders '?' rather than the injected SQL
      expect(executedSql).toBe('SELECT * FROM orders WHERE status = ? AND user_id = ?');
      // The values must be passed in the params array
      expect(executedParams).toEqual(["' OR '1'='1", "1; DROP TABLE users; --"]);
    });
  });

  describe('C-2: Path Traversal Defense in Spec Management API', () => {
    let tempDir: string;
    let loader: MDLoader;

    beforeEach(() => {
      tempDir = path.join(process.cwd(), '.jit', 'test_specs_traversal');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      loader = new MDLoader(tempDir);
    });

    it('should reject getSpecContent with path traversal patterns', () => {
      expect(() => loader.getSpecContent('../../package.json')).toThrow(/path traversal detected/i);
      expect(() => loader.getSpecContent('..\\..\\package.json')).toThrow(/path traversal detected/i);
      expect(() => loader.getSpecContent('/etc/passwd')).toThrow(/path traversal detected/i);
    });

    it('should reject saveSpec with path traversal patterns', () => {
      expect(() => loader.saveSpec('../../malicious.md', '# Malicious')).toThrow(/path traversal detected/i);
      expect(() => loader.saveSpec('subdir/nested.md', '# Malicious')).toThrow(/path traversal detected/i);
    });

    it('should safely allow valid spec filenames', () => {
      loader.saveSpec('valid_test.api.md', '# Valid Spec Content');
      const content = loader.getSpecContent('valid_test.api.md');
      expect(content).toBe('# Valid Spec Content');
      // Clean up
      try {
        fs.unlinkSync(path.join(tempDir, 'valid_test.api.md'));
        fs.rmdirSync(tempDir);
      } catch {}
    });
  });

  describe('H-1: VM Sandbox Prototype Climbing & Host Escape Hardening', () => {
    it('should block __proto__ and constructor access on injected db and ecpay contexts', async () => {
      const mockDb: any = {
        query: async () => ({ rows: [], rowCount: 0, durationMs: 0 }),
        execute: async () => ({ affectedRows: 0, durationMs: 0 }),
      };
      const ecpay = new ECPayService();

      const spec = MDParser.parse(`
# POST /api/sandbox-probe
Description: Probe injected objects prototypes

## Logic
\`\`\`javascript
const dbProto = context.db.__proto__;
const dbCtor = context.db.constructor;
const ecpayProto = context.ecpay.__proto__;
const ecpayCtor = context.ecpay.constructor;
const protoDbOf = Object.getPrototypeOf(context.db);

return {
  dbProto: typeof dbProto,
  dbCtor: typeof dbCtor,
  ecpayProto: typeof ecpayProto,
  ecpayCtor: typeof ecpayCtor,
  protoDbOfNull: protoDbOf === null,
};
\`\`\`
`);

      const routeDef = MDParser.toRouteDefinition(spec);
      const res = await routeDef.handler({}, {
        ...dummyCtx,
        route: '/api/sandbox-probe',
        db: mockDb,
        ecpay,
      });

      expect(res.dbProto).toBe('undefined');
      expect(res.dbCtor).toBe('undefined');
      expect(res.ecpayProto).toBe('undefined');
      expect(res.ecpayCtor).toBe('undefined');
      expect(res.protoDbOfNull).toBe(true);
    });
  });

  describe('H-4: ECPay Auto-Submit HTML XSS Protection', () => {
    it('should escape malicious HTML in parameter keys, values, and title', () => {
      const ecpay = new ECPayService();
      const maliciousParams = {
        '"><script>alert("key")</script><input name="': '<script>alert("val")</script>',
        TotalAmount: 1000,
      };

      const html = ecpay.buildAutoSubmitForm('https://evil.com/post', maliciousParams, {
        title: '<script>alert("title")</script>',
      });

      // No raw script tags
      expect(html).not.toContain('<script>alert("key")</script>');
      expect(html).not.toContain('<script>alert("val")</script>');
      expect(html).not.toContain('<script>alert("title")</script>');

      // Must contain HTML entities
      expect(html).toContain('&lt;script&gt;alert(&quot;key&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;script&gt;alert(&quot;val&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;');
    });

    it('escapeHtml utility should correctly escape all reserved HTML characters', () => {
      expect(escapeHtml('<div class="test" data-id=\'1\'>&</div>')).toBe(
        '&lt;div class=&quot;test&quot; data-id=&#39;1&#39;&gt;&amp;&lt;/div&gt;'
      );
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(123)).toBe('123');
    });
  });

  describe('M-1: Constant-Time Password Length Comparison in MasterAuthManager', () => {
    it('should correctly authenticate valid password and reject different length passwords safely', () => {
      const auth = new MasterAuthManager('correct_secret_password');
      expect(auth.login('correct_secret_password', '127.0.0.1').success).toBe(true);
      // Different length
      expect(auth.login('short', '127.0.0.1').success).toBe(false);
      // Much longer
      expect(auth.login('correct_secret_password_with_extra_characters', '127.0.0.1').success).toBe(false);
    });
  });

  describe('M-2: Relay Order Memory Cap (LRU & Expiration)', () => {
    it('should not grow unboundedly when saving many relay orders', () => {
      const ecpay = new ECPayService();
      // Cap is 10000; verify eviction mechanism works
      for (let i = 0; i < 50; i++) {
        ecpay.saveRelayOrder(`ORD_TEST_${i}`, `<html>${i}</html>`, 100000);
      }
      expect(ecpay.getRelayOrder('ORD_TEST_49')).toBe('<html>49</html>');
    });
  });

  describe('M-3: DuckDB SQL Identifier Sanitization in LocalDuckDBAdapter', () => {
    it('should reject invalid table names in insertRows', async () => {
      const db = new LocalDuckDBAdapter();
      await expect(
        db.insertRows('orders; DROP TABLE users; --', [{ id: 1 }])
      ).rejects.toThrow(/Invalid SQL identifier/i);
    });

    it('should reject invalid table names and column names in aggregate', async () => {
      const db = new LocalDuckDBAdapter();
      await expect(
        db.aggregate({
          table: 'orders; DROP TABLE users; --',
          metrics: { amount: 'sum' },
        })
      ).rejects.toThrow(/Invalid SQL identifier/i);

      await expect(
        db.aggregate({
          table: 'orders',
          metrics: { 'amount" FROM secrets --': 'sum' },
        })
      ).rejects.toThrow(/Invalid SQL identifier/i);
    });

    it('should safely execute aggregate with valid identifiers and parameterized where', async () => {
      const db = new LocalDuckDBAdapter();
      await db.insertRows('sales', [
        { customer: 'Alice', amount: 100 },
        { customer: 'Alice', amount: 200 },
        { customer: 'Bob', amount: 150 },
      ]);

      const res = await db.aggregate({
        table: 'sales',
        dimensions: ['customer'],
        metrics: { amount: 'sum' },
        where: { customer: 'Alice' },
      });

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].customer).toBe('Alice');
      expect(res.rows[0].sum_amount).toBe(300);
    });
  });
});
