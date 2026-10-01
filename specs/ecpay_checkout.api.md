# API: ecpay_checkout
Version: 1.4.4
Stage: prod
> 建立綠界金流付款訂單，產出安全 CheckMacValue、跳轉表單、支付專屬短網址與 QR Code

## Intent
User wants to create an ecpay payment order, checkout with green world pay, or pay via credit card and line pay

## Fields
- amount: number (付款金額)
- itemName: string (購買的商品名稱)
- paymentType: string (付款方式 Credit, ATM, CVS, ALL)

## Sample
- Semantic: 我要透過綠界科技金流付費 1000 元購買年度方案
- Payload:
```json
{
  "amount": 1000,
  "itemName": "JIT-API 年度企業方案",
  "paymentType": "Credit"
}
```

## Logic
```javascript
const amount = Math.round(Number(context.body.amount || 100));
const itemName = context.body.itemName || "JIT-API 數位服務";
const paymentType = context.body.paymentType || "ALL";

// 呼叫 ECPay 插件生成訂單與 CheckMacValue
const order = await context.ecpay.createOrder({
  TotalAmount: amount,
  ItemName: itemName,
  TradeDesc: "JIT 訂閱服務付款",
  ChoosePayment: paymentType,
  ReturnURL: "/api/ecpay/callback"
});

return {
  status: "SUCCESS",
  message: "訂單建立成功，請前往付款",
  orderId: order.orderId,
  amount: order.amount,
  paymentUrl: order.paymentUrl,
  qrCodeSvg: order.qrCodeSvg,
  qrCodeDataUrl: order.qrCodeDataUrl,
  postData: order.params
};
```
