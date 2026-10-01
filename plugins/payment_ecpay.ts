/**
 * JIT Protocol Synthesis Framework - ECPay (綠界金流) Payment Plugin
 * 
 * Provides end-to-end payment processing:
 * 1. Out-of-the-box Stage sandbox credentials (MerchantID: 2000132)
 * 2. 100% compliant CheckMacValue SHA-256 calculation & verification (.NET URL-encode standard)
 * 3. Hosted Checkout Relay: generates direct payment URLs (/api/pay/:orderId)
 * 4. Multi-format QR Code generation (SVG, Data URL, and CLI terminal ASCII)
 * 5. Automatic webhook verification (ReturnURL) with DuckDB order state integration
 * 6. Query trade info API (QueryTradeInfo)
 */

import crypto from 'crypto';
import QRCode from 'qrcode';
import { JITPlugin } from '../core/plugin.js';

export interface ECPayConfig {
  merchantId?: string;
  hashKey?: string;
  hashIv?: string;
  isProduction?: boolean;
  baseUrl?: string;
  defaultPaymentType?: 'Credit' | 'ATM' | 'CVS' | 'BARCODE' | 'ALL';
}

export interface CreateOrderOptions {
  MerchantTradeNo?: string;
  MerchantTradeDate?: string;
  TotalAmount: number;
  TradeDesc?: string;
  ItemName: string | string[];
  ChoosePayment?: 'Credit' | 'ATM' | 'CVS' | 'BARCODE' | 'ALL' | string;
  ReturnURL?: string;
  ClientBackURL?: string;
  OrderResultURL?: string;
  PaymentInfoURL?: string;
  NeedExtraPaidInfo?: 'Y' | 'N';
  CustomField1?: string;
  CustomField2?: string;
  CustomField3?: string;
  CustomField4?: string;
  IgnorePayment?: string;
  [key: string]: any;
}

export interface ECPayOrderResult {
  orderId: string;
  amount: number;
  itemName: string;
  actionUrl: string;
  params: Record<string, any>;
  checkMacValue: string;
  html: string;
  paymentUrl: string;
  qrCodeSvg: string;
  qrCodeDataUrl: string;
  qrCodeTerminal?: string;
}

export interface ECPayCallbackResult {
  valid: boolean;
  isSuccess: boolean;
  returnCode: string;
  message: string;
  data: Record<string, any>;
  tradeNo: string;
  orderId: string;
  amount: number;
  paymentDate: string;
  paymentType: string;
  responseOk: string;
  responseFail: (msg?: string) => string;
}

/**
 * HTML Entity Encoder to prevent XSS injection (H-4 defense)
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ECPayService {
  public static readonly MAX_RELAY_ORDERS = 10000;

  public readonly merchantId: string;
  public readonly hashKey: string;
  public readonly hashIv: string;
  public readonly isProduction: boolean;
  public baseUrl: string;
  public defaultPaymentType: 'Credit' | 'ATM' | 'CVS' | 'BARCODE' | 'ALL';

  // Relay order cache for /api/pay/:orderId with size cap
  private relayOrders = new Map<string, { html: string; createdAt: number; expiresAt: number }>();

  // Official ECPay URLs
  public static readonly STAGE_ACTION_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
  public static readonly PROD_ACTION_URL = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
  public static readonly STAGE_QUERY_URL = 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5';
  public static readonly PROD_QUERY_URL = 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

  constructor(config: ECPayConfig = {}) {
    // Official test credentials for sandbox stage (ECPay documentation public sandbox defaults)
    // SEC-NOTICE (L-1): '2000132' and the accompanying HashKey/HashIV are official public testing credentials
    // provided by ECPay (綠界科技官方公開測試帳號). In production, supply your merchant credentials via env vars.
    this.merchantId = config.merchantId || process.env.ECPAY_MERCHANT_ID || '2000132';
    this.hashKey = config.hashKey || process.env.ECPAY_HASH_KEY || '5294y063111UTYzG';
    this.hashIv = config.hashIv || process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS';
    this.isProduction = config.isProduction ?? (process.env.NODE_ENV === 'production');
    this.baseUrl = config.baseUrl || process.env.PUBLIC_URL || process.env.JIT_TUNNEL_URL || 'http://localhost:3005';
    this.defaultPaymentType = config.defaultPaymentType || 'ALL';
  }

  public getActionUrl(): string {
    return this.isProduction ? ECPayService.PROD_ACTION_URL : ECPayService.STAGE_ACTION_URL;
  }

  public getQueryUrl(): string {
    return this.isProduction ? ECPayService.PROD_QUERY_URL : ECPayService.STAGE_QUERY_URL;
  }

  /**
   * Set base URL dynamically (e.g. when Cloudflare Tunnel connects)
   */
  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /**
   * Resolves relative or absolute callback URL
   */
  public resolveCallbackUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Encode string according to ECPay .NET URL-encoding rules
   */
  public static urlEncode(str: string): string {
    let res = encodeURIComponent(str);
    // 1. Space becomes '+' in .NET form encoding
    res = res.replace(/%20/g, '+');
    // 2. Encoded percent escapes must be lowercase in ECPay calculation
    res = res.replace(/%[0-9a-fA-F]{2}/g, (match) => match.toLowerCase());
    // 3. Restore special characters required by ECPay's .NET encoder
    res = res.replace(/%21/g, '!')
             .replace(/%2a/g, '*')
             .replace(/%28/g, '(')
             .replace(/%29/g, ')')
             .replace(/%2d/g, '-')
             .replace(/%5f/g, '_')
             .replace(/%2e/g, '.')
             .replace(/%7e/g, '~');
    return res;
  }

  /**
   * Computes ECPay CheckMacValue using SHA-256
   */
  public generateCheckMacValue(params: Record<string, any>): string {
    // 1. Exclude CheckMacValue itself
    const filteredKeys = Object.keys(params).filter(
      (k) => k !== 'CheckMacValue' && params[k] !== undefined && params[k] !== null
    );

    // 2. Sort keys alphabetically (case-insensitive / ASCII order)
    filteredKeys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // 3. Format into key=value&key=value
    const paramString = filteredKeys.map((k) => `${k}=${params[k]}`).join('&');

    // 4. Prepend HashKey and append HashIV
    const rawString = `HashKey=${this.hashKey}&${paramString}&HashIV=${this.hashIv}`;

    // 5. URL encode according to ECPay rules and convert to lowercase
    const encoded = ECPayService.urlEncode(rawString).toLowerCase();

    // 6. Compute SHA-256 and convert to UPPERCASE
    return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
  }

  /**
   * Format current date to ECPay format: YYYY/MM/DD HH:mm:ss
   */
  public static formatTradeDate(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}/${m}/${d} ${h}:${min}:${s}`;
  }

  /**
   * Generate a unique 20-character MerchantTradeNo
   */
  public static generateTradeNo(prefix: string = 'ORD'): string {
    const now = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const full = `${prefix}${now}${rand}`;
    return full.slice(0, 20);
  }

  /**
   * Build auto-submitting HTML form for redirecting client to ECPay
   */
  public buildAutoSubmitForm(
    actionUrl: string,
    params: Record<string, any>,
    options?: { title?: string; autoSubmit?: boolean }
  ): string {
    const rawTitle = options?.title || '正在前往綠界金流收銀台...';
    const title = escapeHtml(rawTitle);
    const safeActionUrl = escapeHtml(actionUrl);
    const autoSubmit = options?.autoSubmit ?? true;

    const fields = Object.entries(params)
      .map(([k, v]) => `    <input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
      .join('\n');

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      max-width: 440px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #334155;
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h2 { margin: 0 0 8px; font-size: 1.25rem; font-weight: 600; color: #10b981; }
    p { margin: 0 0 20px; color: #94a3b8; font-size: 0.9rem; }
    button {
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 10px 24px;
      font-size: 0.95rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>${title}</h2>
    <p>交易金額：NT$ ${escapeHtml(Number(params.TotalAmount || 0).toLocaleString())} 元</p>
    <p>正在為您建立加密安全連線，請稍候...</p>
    <form id="ecpay-form" method="POST" action="${safeActionUrl}">
${fields}
      <noscript>
        <button type="submit">立即前往付款</button>
      </noscript>
    </form>
    <button onclick="document.getElementById('ecpay-form').submit()" id="btn-manual" style="display:none;margin-top:10px;">點擊手動前往</button>
  </div>
  ${autoSubmit ? `
  <script>
    setTimeout(function() {
      document.getElementById('ecpay-form').submit();
      setTimeout(function() {
        var btn = document.getElementById('btn-manual');
        if (btn) btn.style.display = 'inline-block';
      }, 3000);
    }, 300);
  </script>` : ''}
</body>
</html>`;
  }

  /**
   * Save relay order HTML in memory for GET /api/pay/:orderId (with LRU eviction and memory bounds)
   */
  public saveRelayOrder(orderId: string, html: string, ttlMs: number = 3600000): void {
    const now = Date.now();
    // Memory DoS mitigation: prune expired and enforce max capacity
    if (this.relayOrders.size >= ECPayService.MAX_RELAY_ORDERS) {
      for (const [key, val] of this.relayOrders.entries()) {
        if (now > val.expiresAt) {
          this.relayOrders.delete(key);
        }
      }
      if (this.relayOrders.size >= ECPayService.MAX_RELAY_ORDERS) {
        const oldestKey = this.relayOrders.keys().next().value;
        if (oldestKey) this.relayOrders.delete(oldestKey);
      }
    }
    this.relayOrders.set(orderId, {
      html,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
  }

  /**
   * Get relay order HTML
   */
  public getRelayOrder(orderId: string): string | undefined {
    const item = this.relayOrders.get(orderId);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.relayOrders.delete(orderId);
      return undefined;
    }
    return item.html;
  }

  /**
   * Generate QR Code for payment URL in multiple formats
   */
  public async generateQrCode(text: string): Promise<{ svg: string; dataUrl: string; terminal: string }> {
    const [svg, dataUrl, terminal] = await Promise.all([
      QRCode.toString(text, { type: 'svg', margin: 2, width: 280 }),
      QRCode.toDataURL(text, { margin: 2, width: 280 }),
      QRCode.toString(text, { type: 'terminal', small: true }),
    ]);
    return { svg, dataUrl, terminal };
  }

  /**
   * Create an ECPay checkout order with CheckMacValue, auto-submit HTML, relay URL, and QR code
   */
  public async createOrder(options: CreateOrderOptions): Promise<ECPayOrderResult> {
    const orderId = options.MerchantTradeNo || ECPayService.generateTradeNo('ORD');
    const tradeDate = options.MerchantTradeDate || ECPayService.formatTradeDate();
    const actionUrl = this.getActionUrl();

    let itemNameStr = '';
    if (Array.isArray(options.ItemName)) {
      itemNameStr = options.ItemName.join('#');
    } else {
      itemNameStr = String(options.ItemName || 'JIT-API 服務項目');
    }

    const returnUrl = options.ReturnURL 
      ? this.resolveCallbackUrl(options.ReturnURL)
      : this.resolveCallbackUrl('/api/ecpay/callback');

    const params: Record<string, any> = {
      MerchantID: this.merchantId,
      MerchantTradeNo: orderId,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: Math.round(Number(options.TotalAmount)),
      TradeDesc: options.TradeDesc || 'JIT-API 交易',
      ItemName: itemNameStr,
      ReturnURL: returnUrl,
      ChoosePayment: options.ChoosePayment || this.defaultPaymentType,
      EncryptType: 1,
    };

    if (options.ClientBackURL) {
      params.ClientBackURL = this.resolveCallbackUrl(options.ClientBackURL);
    }
    if (options.OrderResultURL) {
      params.OrderResultURL = this.resolveCallbackUrl(options.OrderResultURL);
    }
    if (options.PaymentInfoURL) {
      params.PaymentInfoURL = this.resolveCallbackUrl(options.PaymentInfoURL);
    }
    if (options.NeedExtraPaidInfo) {
      params.NeedExtraPaidInfo = options.NeedExtraPaidInfo;
    }
    if (options.CustomField1) params.CustomField1 = options.CustomField1;
    if (options.CustomField2) params.CustomField2 = options.CustomField2;
    if (options.CustomField3) params.CustomField3 = options.CustomField3;
    if (options.CustomField4) params.CustomField4 = options.CustomField4;
    if (options.IgnorePayment) params.IgnorePayment = options.IgnorePayment;

    // Calculate CheckMacValue
    const checkMacValue = this.generateCheckMacValue(params);
    params.CheckMacValue = checkMacValue;

    // Generate auto-submitting HTML form
    const html = this.buildAutoSubmitForm(actionUrl, params);

    // Save relay order HTML so GET /api/pay/:orderId works immediately
    this.saveRelayOrder(orderId, html);

    // Generate hosted payment URL and QR Code
    const paymentUrl = `${this.baseUrl}/api/pay/${orderId}`;
    const qr = await this.generateQrCode(paymentUrl);

    return {
      orderId,
      amount: params.TotalAmount,
      itemName: itemNameStr,
      actionUrl,
      params,
      checkMacValue,
      html,
      paymentUrl,
      qrCodeSvg: qr.svg,
      qrCodeDataUrl: qr.dataUrl,
      qrCodeTerminal: qr.terminal,
    };
  }

  /**
   * Verify ReturnURL Webhook callback received from ECPay
   */
  public verifyCallback(body: Record<string, any>): ECPayCallbackResult {
    if (!body || typeof body !== 'object') {
      return {
        valid: false,
        isSuccess: false,
        returnCode: '',
        message: 'Invalid payload: empty or not an object',
        data: {},
        tradeNo: '',
        orderId: '',
        amount: 0,
        paymentDate: '',
        paymentType: '',
        responseOk: '1|OK',
        responseFail: (msg = 'Error') => `0|${msg}`,
      };
    }

    const checkMacValue = body.CheckMacValue;
    if (!checkMacValue) {
      return {
        valid: false,
        isSuccess: false,
        returnCode: String(body.RtnCode || ''),
        message: 'Missing CheckMacValue',
        data: body,
        tradeNo: String(body.TradeNo || ''),
        orderId: String(body.MerchantTradeNo || ''),
        amount: Number(body.TradeAmt || 0),
        paymentDate: String(body.PaymentDate || ''),
        paymentType: String(body.PaymentType || ''),
        responseOk: '1|OK',
        responseFail: (msg = 'Error') => `0|${msg}`,
      };
    }

    const calculated = this.generateCheckMacValue(body);
    const valid = calculated === String(checkMacValue).toUpperCase();
    const isSuccess = valid && String(body.RtnCode) === '1';

    return {
      valid,
      isSuccess,
      returnCode: String(body.RtnCode || ''),
      message: String(body.RtnMsg || (isSuccess ? 'Paid' : 'Unpaid or failed')),
      data: body,
      tradeNo: String(body.TradeNo || ''),
      orderId: String(body.MerchantTradeNo || ''),
      amount: Number(body.TradeAmt || 0),
      paymentDate: String(body.PaymentDate || ''),
      paymentType: String(body.PaymentType || ''),
      responseOk: '1|OK',
      responseFail: (msg = 'Error') => `0|${msg}`,
    };
  }

  /**
   * Query trade info from ECPay API (QueryTradeInfo)
   */
  public async queryTradeInfo(merchantTradeNo: string): Promise<any> {
    const queryUrl = this.getQueryUrl();
    const params: Record<string, any> = {
      MerchantID: this.merchantId,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
    };
    params.CheckMacValue = this.generateCheckMacValue(params);

    const formBody = Object.keys(params)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    const text = await res.text();
    const result: Record<string, string> = {};
    const pairs = text.split('&');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return result;
  }
}

/**
 * Factory for ECPay Payment Plugin
 */
export function createECPayPlugin(options: ECPayConfig = {}): JITPlugin {
  const service = new ECPayService(options);

  return {
    name: 'payment-ecpay',
    version: '1.4.4',
    description: 'ECPay (綠界金流) Payments Plugin for JIT Protocol Synthesis Framework',
    onInit: (context) => {
      if (context.engine && typeof context.engine.setECPay === 'function') {
        context.engine.setECPay(service);
      }
    },
  };
}
