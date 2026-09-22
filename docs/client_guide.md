# Client 端調用指南 (Client Integration Guide)

本指南說明前端工程師、行動端開發者或跨微服務調用端，如何在 JIT 架構的三個不同生命週期階段，與 Server 進行最自然、高效的通訊。

---

## 1. 生命週期各階段的 Client 調用行為

| 生命週期階段 | Client 傳送內容 | Client 體驗 | AI 延遲 | 適用情境 |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1: 語意熱啟動** | 鬆散 JSON、包含 `message` 的自然語言、未對齊鍵名 | 極速迭代，不需等後端定死 Schema 即可開工 | ~30ms (Needle) 或 ~600ms (Jev) | 開發第一天、功能 Prototype |
| **Phase 2: 結構穩定中** | 鍵名與型態逐漸固定 (如連續 3~5 次相同) | 系統背景觀測中，準備進入凍結 | 同上 | 前後端聯調對齊期 |
| **Phase 3: 傳統極速期** | 規範格式，可帶入產出的 TS 型態或直接打靜態端點 | **0 毫秒 AI 延遲，純二進制/本機驗證極速響應** | **0 ms** | 生產環境、高吞吐量上線期 |
| **Schema Drift 回退** | Client 業務變動，傳入新欄位或新型態 | 無需任何協調，直接傳送，系統無縫承接並升級 v2 | 降回 Phase 1 延遲並重啟觀測 | 業務需求臨時變更時 |

---

## 2. 實戰調用示範

假設 Server 運行於 `http://localhost:3000/api/jit`。

### 階段一：Phase 1 語意熱啟動（前端隨意傳）

在專案剛開始時，前端甚至不知道後端欄位叫 `item` 還是 `productName`，可以直接發送帶有語意的 Payload：

#### 方式 A：使用 cURL
```bash
curl -X POST http://localhost:3000/api/jit \
  -H "Content-Type: application/json" \
  -d '{
    "message": "我要買一台 MacBook Pro 筆電，刷信用卡，金額是 65000",
    "item": "MacBook Pro",
    "amount": 65000,
    "paymentMethod": "CREDIT_CARD"
  }'
```

#### 方式 B：JavaScript / TypeScript (`fetch`)
```typescript
const response = await fetch('http://localhost:3000/api/jit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "我想下單購買耳機，總金額 2500 元",
    item: "無線降噪耳機",
    amount: 2500
  })
});

const result = await response.json();
console.log(result);
// 伺服器會自動路由至 create_order 並正規化回傳：
// { success: true, data: { orderId: "ORD-849201", status: "CONFIRMED", ... } }
```

---

### 階段二：Phase 2 穩定化（連續發送相同結構）

當前後端溝通逐漸固定時，前端保持穩定的 Payload 結構：

```typescript
for (let i = 1; i <= 3; i++) {
  await fetch('http://localhost:3000/api/jit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route: "create_order",  // 可選：指定 route 或讓語意自動判定
      item: `Product-${i}`,
      amount: 1000 * i,
      paymentMethod: "CREDIT_CARD"
    })
  });
}
// 當達到 Server 門檻（例如 3 次），Server 自動觸發 Freeze！
// 在 Server 端的 generated/typescript/create_order.ts 會自動生成合約！
```

---

### 階段三：Phase 3 傳統極速期（使用生成的靜態合約）

路由凍結後，前端可直接複製或引用 Server 生成在 `generated/typescript/create_order.ts` 的型態定義：

```typescript
// 引入自動編譯產出的型態與驗證器
import { CreateOrderRequest, validateCreateOrderRequest } from './generated/typescript/create_order.js';

// 1. 完全型態安全（具備 IDE 自動補全）
const orderPayload: CreateOrderRequest = {
  item: "4K 電競螢幕",
  amount: 18000,
  paymentMethod: "LINE_PAY"
};

// 2. 本地預檢（可選，0ms）
const validation = validateCreateOrderRequest(orderPayload);
if (!validation.success) {
  console.error("前端欄位驗證失敗:", validation.error);
}

// 3. 發送至 Server
const response = await fetch('http://localhost:3000/api/jit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(orderPayload)
});

const res = await response.json();
console.log("⚡ 享受 Phase 3 0ms AI 延遲響應：", res.context.aiLatencyMs); // 0ms!
```

---

### 階段四：Schema Drift 自主演化（Client 業務突發變更）

如果產品經理突然要求：「我們現在下單要支援**優惠券代碼 (couponCode)**，而且金額可能帶小數點！」

傳統開發：
> ❌ 前端等後端改 Proto / OpenAPI ➔ 重新編譯 ➔ 重新發布 ➔ 等待數天。

JIT 開發：
> **✅ 前端直接發送含有新欄位與新型態的請求！**

```typescript
const evolvedPayload = {
  item: "iPad Pro",
  amount: 29990.5,
  paymentMethod: "CREDIT_CARD",
  couponCode: "SUMMER_2026",     // 🌟 新增的未定義欄位！
  isTaxExempt: true               // 🌟 新增的布林旗標！
};

const response = await fetch('http://localhost:3000/api/jit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(evolvedPayload)
});

const res = await response.json();
console.log("🛡️ 自動回退處理成功：", res.success);
console.log("回退標記：", res.context.isFallback); // true
// Server 自動退回 Phase 1 順利完成下單，並且自動開啟 v2 觀測！
// 當新結構再次發送達到門檻後，Server 會自動輸出 v2 版合約，服務從不中斷！
```

---

## 3. Python Client 調用範例 (`requests` / `httpx`)

```python
import requests

SERVER_URL = "http://localhost:8000/api/jit"

# 發送請求
payload = {
    "message": "我想訂購一份咖啡豆，金額 450 元",
    "item": "耶加雪菲咖啡豆",
    "amount": 450,
    "paymentMethod": "LINE_PAY"
}

resp = requests.post(SERVER_URL, json=payload)
data = resp.json()

print(f"路由端點: {data['context']['route']}")
print(f"生命週期: {data['context']['phase']}")
print(f"AI 耗時: {data['context']['ai_latency_ms']} ms")
print(f"業務結果: {data['data']}")
```
