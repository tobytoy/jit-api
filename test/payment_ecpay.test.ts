import { describe, it, expect, beforeEach } from 'vitest';
import { ECPayService, createECPayPlugin } from '../plugins/payment_ecpay.js';
import { JITEngine } from '../core/jit_engine.js';
import { MDParser } from '../core/md_parser.js';

describe('ECPay (綠界金流) Payment Gateway Plugin', () => {
  let ecpay: ECPayService;

  beforeEach(() => {
    // Official Stage test parameters
    ecpay = new ECPayService({
      merchantId: '2000132',
      hashKey: '5294y063111UTYzG',
      hashIv: 'v77hoKGq4kWxNNIS',
      isProduction: false,
      baseUrl: 'http://localhost:3005',
    });
  });

  describe('CheckMacValue & URL-Encoding Algorithms', () => {
    it('should correctly encode characters according to ECPay .NET specification', () => {
      // Space becomes +, specific characters restored to unencoded
      const encoded = ECPayService.urlEncode('Hello World! 100% *()-_. ~');
      expect(encoded).toContain('Hello+World!');
      expect(encoded).toContain('*()-_.');
      expect(encoded).toContain('~');
    });

    it('should generate reproducible, deterministic CheckMacValue for sample parameters', () => {
      const params = {
        MerchantID: '2000132',
        MerchantTradeNo: 'TEST20261001001',
        MerchantTradeDate: '2026/10/01 12:00:00',
        PaymentType: 'aio',
        TotalAmount: 1000,
        TradeDesc: '測試交易描述',
        ItemName: 'VIP 訂閱方案 1000 元',
        ReturnURL: 'http://localhost:3005/api/ecpay/callback',
        ChoosePayment: 'ALL',
        EncryptType: 1,
      };

      const mac1 = ecpay.generateCheckMacValue(params);
      const mac2 = ecpay.generateCheckMacValue(params);

      expect(mac1).toBeDefined();
      expect(typeof mac1).toBe('string');
      expect(mac1.length).toBe(64); // SHA-256 hex is 64 chars
      expect(mac1).toBe(mac1.toUpperCase());
      expect(mac1).toBe(mac2);
    });

    it('should ignore CheckMacValue key itself during calculation', () => {
      const params1 = {
        MerchantID: '2000132',
        TotalAmount: 500,
      };
      const params2 = {
        MerchantID: '2000132',
        TotalAmount: 500,
        CheckMacValue: 'EXISTING_VALUE_TO_BE_IGNORED',
      };

      expect(ecpay.generateCheckMacValue(params1)).toBe(ecpay.generateCheckMacValue(params2));
    });
  });

  describe('Order Creation & Hosted Checkout Relay', () => {
    it('should create order and generate all required fields and auto-submit form', async () => {
      const order = await ecpay.createOrder({
        TotalAmount: 999,
        ItemName: ['專業版會員 1 個月', '電子書教材'],
        TradeDesc: '升級訂閱',
        ChoosePayment: 'Credit',
      });

      expect(order.orderId).toBeDefined();
      expect(order.orderId.length).toBeLessThanOrEqual(20);
      expect(order.amount).toBe(999);
      expect(order.itemName).toBe('專業版會員 1 個月#電子書教材');
      expect(order.actionUrl).toBe(ECPayService.STAGE_ACTION_URL);
      expect(order.params.CheckMacValue).toBe(order.checkMacValue);
      expect(order.params.ChoosePayment).toBe('Credit');
      expect(order.params.EncryptType).toBe(1);

      // Verify HTML form
      expect(order.html).toContain('<!DOCTYPE html>');
      expect(order.html).toContain(ECPayService.STAGE_ACTION_URL);
      expect(order.html).toContain(`value="${order.orderId}"`);
      expect(order.html).toContain('document.getElementById(\'ecpay-form\').submit()');

      // Verify Relay URL & cache retrieval
      expect(order.paymentUrl).toBe(`http://localhost:3005/api/pay/${order.orderId}`);
      const cachedHtml = ecpay.getRelayOrder(order.orderId);
      expect(cachedHtml).toBe(order.html);

      // Verify QR Code generation
      expect(order.qrCodeSvg).toContain('<svg');
      expect(order.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(order.qrCodeTerminal).toBeDefined();
    });

    it('should adapt to custom base URLs (e.g. Cloudflare Tunnel)', async () => {
      ecpay.setBaseUrl('https://my-tunnel.trycloudflare.com');
      const order = await ecpay.createOrder({
        TotalAmount: 150,
        ItemName: '測試商品',
        ReturnURL: '/api/ecpay/callback',
      });

      expect(order.paymentUrl).toBe(`https://my-tunnel.trycloudflare.com/api/pay/${order.orderId}`);
      expect(order.params.ReturnURL).toBe('https://my-tunnel.trycloudflare.com/api/ecpay/callback');
    });
  });

  describe('Webhook Callback Verification', () => {
    it('should successfully verify valid ECPay callback payload', () => {
      const rawPayload: Record<string, any> = {
        MerchantID: '2000132',
        MerchantTradeNo: 'ORD20261001001',
        TradeNo: '2610011400012345',
        RtnCode: '1',
        RtnMsg: '交易成功',
        TradeAmt: '1000',
        PaymentDate: '2026/10/01 14:05:00',
        PaymentType: 'Credit_CreditCard',
        SimulatePaid: '0',
      };

      // Sign the payload
      rawPayload.CheckMacValue = ecpay.generateCheckMacValue(rawPayload);

      const result = ecpay.verifyCallback(rawPayload);
      expect(result.valid).toBe(true);
      expect(result.isSuccess).toBe(true);
      expect(result.orderId).toBe('ORD20261001001');
      expect(result.tradeNo).toBe('2610011400012345');
      expect(result.amount).toBe(1000);
      expect(result.responseOk).toBe('1|OK');
    });

    it('should reject tampered or forged callback payload', () => {
      const rawPayload: Record<string, any> = {
        MerchantID: '2000132',
        MerchantTradeNo: 'ORD20261001001',
        TradeNo: '2610011400012345',
        RtnCode: '1',
        TradeAmt: '1000',
      };
      rawPayload.CheckMacValue = ecpay.generateCheckMacValue(rawPayload);

      // Hacker tampers with amount from 1000 to 1
      rawPayload.TradeAmt = '1';

      const result = ecpay.verifyCallback(rawPayload);
      expect(result.valid).toBe(false);
      expect(result.isSuccess).toBe(false);
    });

    it('should identify failed transactions with valid signature', () => {
      const rawPayload: Record<string, any> = {
        MerchantID: '2000132',
        MerchantTradeNo: 'ORD20261001002',
        TradeNo: '2610011400012346',
        RtnCode: '10100058', // ECPay card declined code
        RtnMsg: '信用卡授權失敗',
        TradeAmt: '500',
      };
      rawPayload.CheckMacValue = ecpay.generateCheckMacValue(rawPayload);

      const result = ecpay.verifyCallback(rawPayload);
      expect(result.valid).toBe(true); // Authentic message from ECPay
      expect(result.isSuccess).toBe(false); // But payment failed
      expect(result.returnCode).toBe('10100058');
    });
  });

  describe('Markdown API & JIT Engine Integration', () => {
    it('should execute checkout API in markdown using context.ecpay', async () => {
      const engine = new JITEngine({ forceNeedle: true });
      const ecpayPlugin = createECPayPlugin({
        merchantId: '2000132',
        baseUrl: 'http://localhost:3005',
      });
      engine.use(ecpayPlugin);

      const mdContent = `
# API: /api/checkout

## Description
建立綠界結帳訂單

## Logic
\`\`\`javascript
const order = await context.ecpay.createOrder({
  TotalAmount: context.body.amount || 300,
  ItemName: context.body.itemName || '測試專案',
  ChoosePayment: 'Credit'
});

return {
  success: true,
  orderId: order.orderId,
  paymentUrl: order.paymentUrl,
  qrCodeSvg: order.qrCodeSvg
};
\`\`\`
`;

      const spec = MDParser.parse(mdContent, 'checkout.api.md');
      const routeDef = MDParser.toRouteDefinition(spec);
      engine.register(routeDef);

      const res = await engine.execute({
        amount: 888,
        itemName: '高級會籍',
      }, '/api/checkout');

      expect(res.success).toBe(true);
      expect(res.data.success).toBe(true);
      expect(res.data.orderId).toBeDefined();
      expect(res.data.paymentUrl).toContain('/api/pay/');
      expect(res.data.qrCodeSvg).toContain('<svg');
    });

    it('should verify payment webhook and record to DuckDB in markdown', async () => {
      const engine = new JITEngine({ forceNeedle: true });
      const mdContent = `
# API: /api/ecpay/callback

## Description
綠界付款回呼

## Store
- Name: analytics
- Provider: local_duckdb

## Logic
\`\`\`javascript
// 1. 初始化資料庫表
await context.db.execute(\`
  CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR PRIMARY KEY,
    trade_no VARCHAR,
    amount INTEGER,
    status VARCHAR
  )
\`);

// 2. 驗證綠界回呼簽章
const verify = context.ecpay.verifyCallback(context.body);

if (!verify.valid) {
  return { status: 400, body: '0|CheckMacValue Error' };
}

if (verify.isSuccess) {
  await context.db.execute(
    "INSERT INTO orders (order_id, trade_no, amount, status) VALUES (?, ?, ?, 'PAID')",
    [verify.orderId, verify.tradeNo, verify.amount]
  );
}

const check = await context.db.query("SELECT * FROM orders WHERE order_id = ?", [verify.orderId]);

return {
  status: 200,
  body: '1|OK',
  recordedOrder: check.rows[0]
};
\`\`\`
`;

      const spec = MDParser.parse(mdContent, 'callback.api.md');
      const routeDef = MDParser.toRouteDefinition(spec);
      engine.register(routeDef);

      const callbackPayload: Record<string, any> = {
        MerchantID: '2000132',
        MerchantTradeNo: 'ORD_TEST_DUCKDB_01',
        TradeNo: 'ECPAY_TRADE_9999',
        RtnCode: '1',
        RtnMsg: '交易成功',
        TradeAmt: '1200',
        PaymentDate: '2026/10/01 14:15:00',
      };
      callbackPayload.CheckMacValue = engine.getECPay().generateCheckMacValue(callbackPayload);

      const res = await engine.execute(callbackPayload, '/api/ecpay/callback');
      expect(res.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(res.data.body).toBe('1|OK');
      expect(res.data.recordedOrder).toBeDefined();
      expect(res.data.recordedOrder.order_id).toBe('ORD_TEST_DUCKDB_01');
      expect(res.data.recordedOrder.status).toBe('PAID');
    });
  });
});
