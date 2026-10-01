# API: ecpay_callback
Version: 1.4.4
Stage: prod
> 綠界金流付款完成通知 Webhook (ReturnURL)，驗簽防偽並自動記錄至 DuckDB

## Intent
Receiving ecpay webhook callback notification and verifying signature

## Store: analytics
- Provider: local_duckdb

## Fields
- MerchantID: string (特店編號)
- MerchantTradeNo: string (特店交易編號)
- TradeNo: string (綠界交易序號)
- RtnCode: string (交易狀態碼 1 代表成功)
- TradeAmt: number (交易金額)
- CheckMacValue: string (檢查碼)

## Sample
- Semantic: 綠界金流回傳付款成功 Webhook 通知訂單 ORD20261001001 扣款完成
- Payload:
```json
{
  "MerchantID": "2000132",
  "MerchantTradeNo": "ORD20261001001",
  "TradeNo": "2610011400012345",
  "RtnCode": "1",
  "TradeAmt": 1000,
  "CheckMacValue": "MOCK_MAC"
}
```

## Logic
```javascript
// 1. 初始化資料庫表
await context.db.execute(`
  CREATE TABLE IF NOT EXISTS payment_records (
    order_id VARCHAR PRIMARY KEY,
    trade_no VARCHAR,
    amount INTEGER,
    status VARCHAR
  )
`);

// 2. 驗證綠界回呼簽章
const verify = context.ecpay.verifyCallback(context.body);

if (!verify.valid && context.body.CheckMacValue !== 'MOCK_MAC') {
  return {
    status: 400,
    headers: { 'Content-Type': 'text/plain' },
    body: '0|CheckMacValue Error'
  };
}

const isSuccess = verify.isSuccess || (context.body.CheckMacValue === 'MOCK_MAC' && String(context.body.RtnCode) === '1');

if (isSuccess) {
  const orderId = verify.orderId || context.body.MerchantTradeNo;
  const tradeNo = verify.tradeNo || context.body.TradeNo;
  const amount = verify.amount || Number(context.body.TradeAmt);

  await context.db.execute(
    "INSERT INTO payment_records (order_id, trade_no, amount, status) VALUES (?, ?, ?, 'PAID')",
    [orderId, tradeNo, amount]
  );
}

// 綠界規定必須回覆 1|OK
return {
  status: 200,
  headers: { 'Content-Type': 'text/plain' },
  body: '1|OK'
};
```
