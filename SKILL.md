---
name: jit-protocol-framework
description: Guide AI agents (Cursor, Windsurf, Claude Code, Antigravity) on using the JIT Protocol Synthesis Framework for dynamic-to-static API development.
---

# JIT Protocol Synthesis Skill

本規範指導 AI Agent（如 Cursor, Windsurf, Claude Code, Antigravity）如何在本專案中開發、維護與擴充基於 **JIT 協定合成框架（Just-In-Time Protocol Synthesis）** 的微服務通訊與 API 端點。

---

## 1. 核心理念 (Core Philosophy)

傳統開發中，前後端或跨服務通訊需提早定義死板的 Protobuf 或 OpenAPI Schema，造成溝通與修改成本過高；而直接使用 LLM 解析 JSON 則面臨高延遲（High Latency）與幻覺（Hallucination）。

本框架採用 **「動態語意協商 ➔ 靜態程式碼凍結」** 雙軌生命週期：
1. **Phase 1 (語意熱啟動期)**：開發者以自然語言宣告意圖與 Handler，Client 端發送鬆散 JSON，由 TypeSafe (Jev) 微型決策引擎進行毫秒級 Intent 路由、Enum 選取與安全護欄 (Noul)。
2. **Phase 2 (觀察與凍結期)**：背景 `SchemaObserver` 自動統計傳輸資料結構與 Jev 信心度。當連續 N 次（預設 5 次）一致且信心度達標時，自動觸發 Freeze。
3. **Phase 3 (傳統極速期)**：調用 `CodegenEngine` 與預置程式碼積木（`blocks/`），輸出 TypeScript (Zod)、Golang (.proto / Go Struct) 與 Python (Pydantic / FastAPI)，切換至 0 AI 延遲極速路徑。
4. **Fallback (版本退化保護)**：當 Phase 3 遇上新欄位（Schema Drift），靜態驗證攔截並自動降級回 Phase 1，由 Jev 重新解析並開啟 v2 演化觀察。

---

## 2. AI Agent 快速開發守則

### 規則 A：如何註冊新的 API Endpoint (Natural Language Intent Declaration)
當使用者要求「新增一個結帳 API」或「這裡要接收使用者退費申請」時，AI Agent **不需要手寫 Protobuf 或死板 Schema**，只需呼叫 `engine.register(...)` 宣告路由意圖：

```typescript
import { JITEngine, JITRequestContext } from './core/index.js';

const engine = new JITEngine();

engine.register({
  route: 'process_refund',
  description: 'Process user refund request with amount and reason',
  // 提供給 TypeSafe Jev Choice 用於精準判斷意圖
  intentCriteria: 'User requests a refund, return, or money back for an order',
  // 可選：列舉欄位萃取定義 (TypeSafe Select)
  enumFields: {
    urgency: {
      high: 'VIP customer or legal dispute',
      normal: 'Standard customer refund request',
      low: 'Minor issue or informational inquiry'
    }
  },
  // 業務處理器
  handler: async (payload: any, ctx: JITRequestContext) => {
    // payload 已由 Jev 正規化
    return {
      refundId: 'ref_' + Math.random().toString(36).substring(2, 9),
      processed: true,
      amount: payload.amount,
      urgency: payload.urgency
    };
  }
});
```

### 規則 B：防範 LLM 幻覺，善用預置積木 (`blocks/`)
AI Agent 在擴充程式碼生成支援時，**嚴禁憑空捏造未經驗證的 AST 結構**。必須使用 `blocks/` 中的模組化樣板：
- `blocks/ast_typescript/ts_block.ts`: 輸出嚴謹的 Zod 3 物件與 TypeScript 型態。
- `blocks/ast_golang/go_block.ts`: 輸出標準 `proto3` 訊息語法與 Go Struct Tags (`json:"..." protobuf:"..."`)。
- `blocks/ast_python/py_block.ts`: 輸出 Pydantic v2 `BaseModel` 與 FastAPI APIRouter。

### 規則 C：處理 Schema Drift 與版本迭代
- 當業務需求變動、Client 發送新欄位時，不要手動修改 Phase 3 產生的檔案。
- 讓 Client 直接發送新 Payload，框架會自動觸發 `FallbackHandler` 降級至 Phase 1，並重啟 Phase 2 收集新的穩定資料結構，自動在 `generated/` 產出更新版合約。

### 規則 D：Markdown 標記式 API (MD-API) 規範與合成
當使用者說「我寫好某個 API 的 Markdown 了」或要求新增業務端點時，AI Agent 優先在 `specs/` 下維護 `*.api.md` 規格書，無需手寫複雜程式碼：

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

- **規格要點**：
  - `Version: 1.0.0`：宣告規格版號。
  - `Stage: dev | prod`：未成熟 API 標記 `Stage: dev`，只在開發模式加載；正式 API 標記 `Stage: prod`。
  - `## Sample`：務必提供語意與 JSON 範例，供前端控制台與 k6 壓測引擎動態注入測試。若未填寫，系統將自動從 `## Fields` 進行智慧推導。
- 伺服器與 `MDLoader` 會自動動態掃描 `specs/` 目錄並即時掛載。

---

## 3. 常見任務快速指令

- **一鍵啟動開發模式 (Web 儀表板 + Terminal + 熱重載, Port 3005)**：
  ```bash
  npx jit-api dev
  # 或本地執行 ./run.sh
  ```
- **啟動生產模式 (高效純 API Gateway + 安全加固, Port 3000)**：
  ```bash
  npx jit-api start
  ```
- **發布規格快照版本 / 線上快速回滾降版**：
  ```bash
  npx jit-api release 1.0.0 "初次生產穩定發布"
  npx jit-api rollback 1.0.0
  ```
- **執行完整端到端生命週期演示**：
  ```bash
  npm run demo
  npm run demo:needle
  npm run demo:py
  ```
- **執行 Grafana k6 壓力測試**：
  ```bash
  ./bin/k6 run benchmark/k6_stress_test.js
  ```
- **執行自動化測試**：
  ```bash
  npm test
  npm run test:py
  ```
- **編譯專案**：
  ```bash
  npm run build
  ```
