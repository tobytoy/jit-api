---
name: jit-protocol-framework
description: Guide AI agents (Cursor, Windsurf, Claude Code, Antigravity) on using the JIT Protocol Synthesis Framework for dynamic-to-static API development, self-adaptive schema evolution, and ConnectRPC multi-protocol gateway.
---

# JIT Protocol Synthesis Skill (v1.3.0)

本規範指導 AI Agent（如 Cursor, Windsurf, Claude Code, Antigravity）如何在本專案中開發、維護與擴充基於 **JIT 協定合成框架（Just-In-Time Protocol Synthesis）** 的微服務通訊與 API 端點。

---

## 1. 核心理念與產品賣點 (Core Philosophy & Value Proposition)

傳統開發中，前後端或跨服務通訊需提早定義死板的 Protobuf 或 OpenAPI Schema，造成跨團隊溝通與修改成本極高；而直接使用 LLM 解析 JSON 則面臨高延遲（High Latency）與幻覺（Hallucination）。

**JIT-API 的核心賣點在於：對人類最友善的微調體驗（修改 Markdown 或一句話交代 Agent）＋ 極限自動化自適應與極速結晶。**

本框架採用 **「動態語意協商 ➔ 靜態程式碼凍結 ➔ 自適應平滑演化」** 三態循環：
1. **Phase 1 (語意熱啟動期)**：開發者以自然語言宣告意圖或撰寫 Markdown，Client 端可發送鬆散 JSON，由 TypeSafe (Jev) 或 Needle 進行毫秒級 Intent 路由、Enum 選取與安全護欄 (Noul)。
2. **Phase 2 (觀察與雙向推斷期)**：背景 `SchemaObserver` 同時統計 Request 與 Response 的資料結構與信心度。當連續 N 次（預設 5 次）一致時，自動觸發 Freeze。
3. **Phase 3 (極速靜態期)**：調用 `CodegenEngine` 與預置程式碼積木（`blocks/`），輸出強型別 TypeScript (Zod)、Golang (.proto / Go Struct) 與 Python (Pydantic / FastAPI)，切換至 **0ms AI 延遲** 的 Fast-Path。
4. **自適應容錯修復 (Auto-Repair on Fallback)**：當 Client 突然改送 camelCase（如 `userId` 代替 `user_id`）、字串型態數字或別名時，`AutoRepairer` 在記憶體自動對齊修復，保證後端 Handler **100% 零崩潰**。
5. **多版本共存 (Multi-Version Union)**：新舊版本（v1、v2）在 Phase 3 同時並存，徹底杜絕灰度發布（Canary）時的「乒乓漂移（Ping-Pong Drift）」。
6. **快照持久化 (Snapshot Persistence)**：自動保存至 `.jit/schemas.json`，重啟伺服器瞬間載入，開機第 1 個請求就是 0ms。
7. **三合一協議 (Triple-Protocol)**：同時原生支援 REST JSON、Connect Protocol v1、gRPC-Web 與標準 gRPC（含 5-byte 二進位 Envelope Framing）。
8. **智慧多角色切換 (Mock Server / Mock Client / Digital Twin Proxy)**：支援零後端 Mock Server（REST + ConnectRPC 雙協議）、合成/Fuzz/Chaos 流量注入驗收客戶端，以及旁路無感錄製真實流量自動結晶出 Markdown 規格與斷線數位孿生。

---

## 2. AI Agent 快速開發守則

### 規則 A：最極簡開發流程——「跟 Agent 說，或是寫 Markdown」
當使用者要求「新增一個結帳 API」或「修改會員資料欄位」時：
* **優先方式**：在 `specs/` 目錄新增或修改 `*.api.md` 規格書，無需手寫繁複的 Go/TS/Python 代碼與型態定義！
* 伺服器自帶 `MDLoader` 熱加載（Hot-Reload），使用者存檔後立即生效。

```markdown
# API: create_order
Version: 1.0.0
Stage: prod
> 處理使用者下單與訂單成立

## Intent
User wants to buy, purchase, checkout or order items and products

## Fields
- item: string (購買商品)
- amount: number (結帳金額)
- paymentMethod: enum (付款方式)
  - CREDIT_CARD: 信用卡
  - LINE_PAY: 行動支付

## Sample
- Semantic: 我想訂購一台頂配筆電，刷信用卡，金額是 89000 元
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
return {
  order_id: "ORD-" + Math.floor(Math.random() * 900000 + 100000),
  status: "CONFIRMED",
  item: payload.item,
  amount: Number(payload.amount || 0),
  paymentMethod: payload.paymentMethod
};
```
```

### 規則 B：使用程式碼註冊 API (`engine.register`)
若使用者希望以程式碼方式定義路由，只需呼叫 `engine.register(...)`：

```typescript
import { JITEngine, JITRequestContext } from './core/index.js';

const engine = new JITEngine({
  driftMode: 'evolve', // 支援平滑演化
  persistence: true,   // 啟用 .jit/schemas.json 持久化
});

engine.register({
  route: 'process_refund',
  description: 'Process user refund request with amount and reason',
  intentCriteria: 'User requests a refund, return, or money back for an order',
  enumFields: {
    urgency: {
      high: 'VIP customer or legal dispute',
      normal: 'Standard customer refund request',
      low: 'Minor issue or informational inquiry'
    }
  },
  handler: async (payload: any, ctx: JITRequestContext) => {
    return {
      refundId: 'ref_' + Math.random().toString(36).substring(2, 9),
      processed: true,
      amount: payload.amount,
      urgency: payload.urgency
    };
  }
});
```

### 規則 C：處理規格突變 (Schema Drift) 與演化
* **新增欄位 (Soft Drift)**：在預設 `driftMode: 'evolve'` 下，新增欄位會直接放行傳給 Handler，並在背景自動累積樣本，達標後平滑晉升為 vNext，**完全不中斷線上服務**。
* **欄位改名或型態突變 (Hard Drift)**：系統觸發 `AutoRepairer` 自動進行大小寫轉換（`userId` -> `user_id`）與轉型，後端 Handler 依舊能正常執行，同時記錄第 1 筆新樣本，穩定後自動並存。
* **切勿手動修改 `generated/` 檔案**：合約由 JIT 引擎在 Phase 2 自動結晶合成，手動修改會被覆蓋。

### 規則 D：防範 LLM 幻覺，善用預置積木 (`blocks/`)
AI Agent 在擴充程式碼生成支援時，必須使用 `blocks/` 中的模組化樣板：
- `blocks/ast_typescript/ts_block.ts`: 輸出 Request 與 Response 的 Zod 驗證器與 TypeScript 型態。
- `blocks/ast_golang/go_block.ts`: 輸出標準 `proto3`（Request 與 Typed Response）與 Go Struct Tags。
- `blocks/ast_python/py_block.ts`: 輸出 Pydantic v2 `BaseModel`（含 Response 模型）與 FastAPI APIRouter。

### 規則 E：掛載 ConnectRPC 支援
若要提供瀏覽器前端與 gRPC 跨服務呼叫：
```typescript
import { ConnectAdapter } from './core/connect_adapter.js';

ConnectAdapter.attachToExpress(app, engine, mdLoader, {
  serviceName: 'jit.v1.JITService',
});
```
* 支援通用端點：`POST /jit.v1.JITService/Execute`
* 支援具名端點：`POST /jit.v1.JITService/CreateOrder`
* 支援二進位通訊：帶有 `Content-Type: application/connect+proto` 的 5-byte Envelope Framing。

### 規則 F：善用 Mock Server、Mock Client 與 Proxy Recorder
當使用者需要無後端開發、流量驗收或錄製 live 服務時：
* **啟動 Mock Server**：`npx jit-api mock`（同時支援 REST 與 ConnectRPC，具備 Phase 3 快速結晶能力）。
* **發送合成/Chaos 流量驗收**：`npx jit-api mock-client --target <url> --mode fuzz`。
* **旁路錄製或斷線數位孿生**：`npx jit-api proxy --target http://api.example.com`（穩定後自動生成 `specs/recorded_*.api.md`，目標當機時自動切換數位孿生）。

---

## 3. 常見任務快速指令

- **一鍵啟動開發模式 (Web 儀表板 + Terminal + 熱重載, Port 3005)**：
  ```bash
  npm run dev
  # 或 npx jit-api dev
  ```
- **啟動生產模式 (高效純 API Gateway + 安全加固, Port 3000)**：
  ```bash
  npx jit-api start
  ```
- **啟動智慧 Mock Server (零後端即刻開工, REST + ConnectRPC)**：
  ```bash
  npx jit-api mock --port 3005
  ```
- **啟動合成流量 Client 驗收後端 (支援 valid, fuzz, chaos 模式)**：
  ```bash
  npx jit-api mock-client --target http://localhost:3000 --mode fuzz --count 5
  ```
- **啟動旁路錄製代理與斷線數位孿生**：
  ```bash
  npx jit-api proxy --target http://api.example.com
  ```
- **規格一鍵自動化測試**：
  ```bash
  npx jit-api test
  ```
- **發布規格快照版本 / 線上快速回滾降版**：
  ```bash
  npx jit-api release 1.3.0 "功能更新"
  npx jit-api rollback 1.3.0
  ```
- **執行全套單元測試 (21 個檔案、58 項測試)**：
  ```bash
  npm test
  ```
- **編譯專案 TypeScript 代碼**：
  ```bash
  npm run build
  ```
