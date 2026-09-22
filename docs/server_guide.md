# Server 端整合指南 (Server Integration Guide)

本指南詳細說明如何在您的後端應用程式中引入 JIT 協定合成框架，提供 **TypeScript (Express)** 與 **Python (FastAPI)** 兩種語言的完整實作方式。

---

## 1. 核心概念與職責

在 JIT 架構中，Server 端主要扮演三個角色：
1. **動態閘道 (Dynamic Gateway)**：在開發初期（Phase 1），接收 Client 送來的非結構化或語意鬆散的 Payload，利用 **TypeSafe (Jev)** 或端側小模型 **Needle** 自動判斷路由意圖、過濾惡意攻擊並萃取必要欄位。
2. **流量統計者 (Traffic Observer)**：在背景（Phase 2）持續記錄每一條路由的資料結構與 Confidence。一旦達到穩定門檻（預設連續 3~5 次一致），自動將資料結構萃取為 IR Schema 並「凍結」。
3. **靜態極速路徑 (Static Fast-Path)**：凍結後（Phase 3），Server 自動掛載本地編譯的靜態驗證器（TypeScript 的 Zod 或 Python 的 Pydantic v2），以 **0ms AI 延遲、0 API 費用** 的本地速度處理後續請求；若遇新型態則自動回退重啟觀測。

---

## 2. TypeScript / Node.js 伺服器建置 (Express 範例)

### 步驟 A：安裝依賴
```bash
npm install express dotenv zod
npm install -D @types/express tsx typescript
```

### 步驟 B：建立伺服器 (`server.ts`)

```typescript
import express from 'express';
import { JITEngine, JITRequestContext } from './core/index.js';

const app = express();
app.use(express.json());

// 1. 初始化 JIT 引擎
const engine = new JITEngine({
  stabilityThreshold: 3,  // 連續 3 次相同結構即觸發凍結
  confidenceThreshold: 0.85,
  onFreeze: (codegen) => {
    console.log(`❄️  [FREEZE] 路由 "${codegen.schema.route}" 已自動凍結！`);
    console.log(`📦 生成檔案：${codegen.files.typescript}`);
  },
  onDrift: (route, error) => {
    console.log(`⚠️  [DRIFT] 路由 "${route}" 欄位變更：${error}，已降級回 Phase 1 並開啟 v2 觀測。`);
  }
});

// 2. 註冊業務端點（無需預先手寫死板 Schema，自然語言宣告即可）
engine.register({
  route: 'create_order',
  description: '處理使用者下單與結帳請求',
  intentCriteria: 'User wants to buy, purchase, checkout or place an order for products',
  enumFields: {
    paymentMethod: {
      CREDIT_CARD: '信用卡付款',
      LINE_PAY: 'Line Pay 行動支付',
      BANK_TRANSFER: '銀行轉帳'
    }
  },
  handler: async (payload: any, ctx: JITRequestContext) => {
    // 業務處理邏輯
    return {
      orderId: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      status: 'CONFIRMED',
      item: payload.item || '預設商品',
      amount: Number(payload.amount || 0),
      paymentMethod: payload.paymentMethod || 'CREDIT_CARD',
      processedPhase: ctx.phase,
      aiLatencyMs: ctx.aiLatencyMs
    };
  }
});

// 3. 開放單一動態 JIT 入口
app.post('/api/jit', async (req, res) => {
  try {
    const result = await engine.execute(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. 查詢指定路由狀態
app.get('/api/jit/status/:route', (req, res) => {
  res.json(engine.getRouteStatus(req.params.route));
});

app.listen(3000, () => {
  console.log('🚀 JIT Express Server 運行於 http://localhost:3000');
});
```

---

## 3. Python 伺服器建置 (FastAPI 範例)

### 步驟 A：安裝依賴 (在 conda `toby` 環境)
```bash
pip install fastapi uvicorn pydantic requests python-dotenv cactus-needle
```

### 步驟 B：建立伺服器 (`server.py`)

```python
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from jit_api import JITEngine

app = FastAPI(title="JIT Python Server")

# 1. 初始化引擎
engine = JITEngine(
    stability_threshold=3,
    confidence_threshold=0.85,
    on_freeze=lambda codegen: print(f"❄️  [FREEZE] {codegen['schema'].route} 已凍結！產出 Pydantic: {codegen['files']['python']}"),
    on_drift=lambda route, err: print(f"⚠️  [DRIFT] {route} 發生漂移：{err}")
)

# 2. 以優雅的裝飾器宣告業務邏輯
@engine.route(
    name="create_order",
    description="處理使用者下單與結帳請求",
    intent="User wants to buy, purchase, checkout or place an order for products",
    enum_fields={
        "paymentMethod": {
            "CREDIT_CARD": "信用卡付款",
            "LINE_PAY": "Line Pay 行動支付",
            "BANK_TRANSFER": "銀行轉帳"
        }
    }
)
async def handle_create_order(payload: dict, ctx):
    return {
        "order_id": "ORD-" + str(abs(hash(payload.get("item", ""))) % 900000 + 100000),
        "status": "CONFIRMED",
        "item": payload.get("item", "預設商品"),
        "amount": float(payload.get("amount", 0)),
        "payment_method": payload.get("paymentMethod", "CREDIT_CARD"),
        "phase": ctx.phase,
        "ai_latency_ms": ctx.ai_latency_ms,
    }

# 3. 提供統一動態 JIT Gateway 端點
@app.post("/api/jit")
async def jit_entrypoint(request: Request):
    try:
        body = await request.json()
        result = await engine.execute(body)
        return {
            "success": result.success,
            "data": result.data,
            "context": {
                "route": result.context.route,
                "phase": result.context.phase,
                "ai_latency_ms": result.context.ai_latency_ms,
                "engine_used": result.context.engine_used,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# 4. 路由狀態端點
@app.get("/api/jit/status/{route}")
async def get_route_status(route: str):
    return engine.get_route_status(route)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

---

## 4. 伺服器進階配置選項

### 雙引擎自動切換 (TypeSafe vs Needle)
* **有金鑰模式 (Cloud Mode)**：在 `.env` 設定 `TYPESAFE_API_KEY=...`，Server 自動使用雲端 Jev 模型，具備最完整的 Noul 安全過濾與語意 Choice。
* **無金鑰模式 (Offline / Local Mode)**：若未檢測到 `TYPESAFE_API_KEY`，Server **自動無縫切換為本地 Needle 引擎**：
  * Python 原生引擎直接在進程記憶體中載入 `cactus-needle`，推論僅需數毫秒，**0 API 成本、100% 離線可用**。
  * TypeScript 引擎自動調用解耦本地 Needle 伺服器 (`NEEDLE_SERVER_URL`，預設 `http://127.0.0.1:8000`)。

### 穩定度門檻 (`stabilityThreshold`)
* 預設為 `5`（生產環境推薦），表示需要連續 5 次完全一致的請求結構才會觸發凍結。
* 在本機開發或展示時可設為 `2` 或 `3`，以加速進入 Phase 3 極速期。
