# API: create_order
Version: 1.0.0
Stage: prod
> 處理使用者下單與訂單成立

## Intent
User wants to buy, purchase, checkout or place an order for products and goods

## Fields
- item: string (購買的商品名稱)
- amount: number (訂單付款總金額)
- paymentMethod: enum (付款方式)
  - CREDIT_CARD: 信用卡線上刷卡
  - LINE_PAY: Line Pay 行動支付
  - APPLE_PAY: Apple Pay 感應支付

## Sample
- Semantic: 我想訂購一台 M4 Max 頂配 MacBook Pro，刷信用卡，金額是 89000 元
- Payload:
```json
{
  "item": "MacBook Pro M4 Max",
  "amount": 89000,
  "paymentMethod": "CREDIT_CARD"
}
```

## Logic
```javascript
const amt = Number(payload.amount || 0);
return {
  order_id: "ORD-" + Math.floor(Math.random() * 900000 + 100000),
  status: "CONFIRMED",
  item: payload.item || "預設商品",
  amount: amt,
  payment_method: payload.paymentMethod || "CREDIT_CARD",
  phase: ctx.phase,
  ai_latency_ms: ctx.aiLatencyMs,
  engine_used: ctx.engineUsed,
  processed_at: new Date().toISOString()
};
```
