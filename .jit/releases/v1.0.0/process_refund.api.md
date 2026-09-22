# API: process_refund
Version: 1.0.0
Stage: prod
> 處理使用者退款與售後申請

## Intent
User wants to refund, return items, get money back, or cancel order with refund

## Fields
- orderId: string (原訂單編號)
- refundAmount: number (申請退款金額)
- reason: string (退款原因與說明)
- priority: enum (案件處理緊急度)
  - URGENT: 緊急客訴或法律爭議案件
  - NORMAL: 一般售後滿意度退貨
  - LOW: 輕微退差價或小額折抵

## Sample
- Semantic: 我想申請退款退貨，訂單編號是 ORD-556677，金額 18500 元，商品有刮痕
- Payload:
```json
{
  "orderId": "ORD-556677",
  "refundAmount": 18500,
  "reason": "商品開箱即有明顯刮痕，申請全額換貨或退款",
  "priority": "URGENT"
}
```

## Logic
```javascript
const amt = Number(payload.refundAmount || 0);
return {
  refund_id: "REF-" + Math.floor(Math.random() * 900000 + 100000),
  order_id: payload.orderId || "UNKNOWN_ORD",
  refund_amount: amt,
  status: "REFUND_PENDING_APPROVAL",
  priority: payload.priority || "NORMAL",
  reason: payload.reason || "使用者未填寫原因",
  phase: ctx.phase,
  ai_latency_ms: ctx.aiLatencyMs
};
```
