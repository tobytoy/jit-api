# Markdown 標記式 API (MD-API) 與 Agent 協同開發指南

> **「工程師與 PM 只需寫 Markdown，Agent 搞定所有代碼，使用者 `./run.sh` 開箱即用」**

本指南詳細說明 JIT-API 2.0 全新推出的 **MD-API 規格語言** 與 **AI Agent 協同開發工作流**。

---

## 1. 為什麼採用 Markdown 標記 API (MD-API)？

傳統 API 開發面臨兩難：
1. **OpenAPI (Swagger) / Protobuf 痛點**：
   - 充滿繁瑣的巢狀 YAML/JSON 或嚴格的語法格式，手寫極度痛苦且極易出錯。
   - 無法表達「自然語言的模糊查詢意圖（Intent）」。
   - 非後端工程師（如 PM、前端、QA）完全看不懂也改不動。
2. **手寫 TypeScript / Python Decorator 痛點**：
   - 需要熟悉框架 Context、語法裝飾器與異步處理邏輯，心智負擔較大。

### MD-API 的革新優勢：
- **規格即文件，文件即代碼 (Spec as Code, Spec as Doc)**：規格檔案直接放在專案 `specs/` 資料夾下，任何人打開都能閱讀。
- **對 AI Agent 99.9% 友好**：LLM 本身在大量 Markdown 語料下訓練，解析與生成 Markdown 幾乎 0 幻覺。
- **動態熱加載 (Hot-Reload)**：修改 Markdown 存檔後，伺服器立即無縫更新端點，無需重啟！

---

## 2. MD-API 規格語法規範 (`specs/*.api.md`)

每個 API 規格皆為單獨的 Markdown 檔案，檔名格式建議為 `{route_name}.api.md`：

```markdown
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
  ai_latency_ms: ctx.aiLatencyMs
};
```
```

### 各區塊語法說明：
| 區塊標籤 | 說明 | 必要性 | 範例 |
| :--- | :--- | :--- | :--- |
| `# API: {name}` | API 路由唯一識別名稱 | **必填** | `# API: process_refund` |
| `Version: {x.y.z}` | 語意化版本號 | 選填 (預設 1.0.0) | `Version: 1.0.0` |
| `Stage: {dev\|prod}` | 部署環境階段 (`dev` 草稿, `prod` 生產) | 選填 (預設 dev) | `Stage: prod` |
| `> {description}` | 該 API 的業務功能簡述 | 建議填寫 | `> 處理使用者退費與案件審核` |
| `## Intent` | 告訴 AI 引擎該端點接收什麼自然語言意圖 | **必填** | `User wants to refund or return items` |
| `## Fields` | 接收的欄位清單與型態註解 | 選填 | `- amount: number (退款金額)` |
| 列舉縮排 | 在 enum 欄位下縮排條列選項與說明 | 搭配 enum | `  - URGENT: 緊急案件` |
| `## Auth` | 規格級鑑權驗證 (支援 bearer 與 api-key) | 選填 (v1.2.0+) | `type: bearer` 或 `type: api-key` |
| `## Sample` | 測試範例（含自然語言語意字串與 JSON Payload） | **強烈推薦** | 前端控制台、壓測與 test 套件動態帶入 |
| `## Logic` | JavaScript/TypeScript 業務處理程式碼區塊 | 建議填寫 | 運行於 `node:vm` 沙盒隔離環境 |
| `## Mock` | 若尚未寫業務代碼，可直接給予 Mock JSON | 與 Logic 擇一 | ````json\n{"status": "SUCCESS"}\n```` |

> [!TIP]
> **智慧欄位推導 (Smart Fallback)**：即使忘記撰寫 `## Sample` 區塊，`MDParser` 也會自動根據 `## Fields` 的欄位定義自動合成合理的測試假資料，徹底杜絕前端與壓測引擎寫死資料的尷尬！

---

## 3. 兩種開發使用場景

### 場景一：一般使用者 / 前端工程師（瀏覽器一鍵操作）
1. 終端機執行一鍵啟動：
   ```bash
   ./run.sh
   ```
2. 瀏覽器開啟：`http://localhost:3005`
3. 進入 **「📝 Markdown API 規格書」** 分頁：
   - 可以即時線上預覽所有已存在的規格。
   - 點擊 **「+ 新增規格」** 或直接在在線編輯器中修改內容。
   - 點擊 **「💾 儲存修改」** ➔ 點擊 **「⚡ 即時熱加載 (Hot-Reload)」**。
   - 切換回「🧭 路由即時觀測」分頁，新 API 馬上上線可供呼叫！

---

### 場景二：後端工程師與 AI Agent 協同開發（對話即交付）
工程師在 VS Code / Cursor / Claude Code / Antigravity 中只需在 `specs/` 新增檔案，例如建立 `specs/user_kyc.api.md`：

```markdown
# API: verify_identity
> 驗證使用者身分證與證件照片

## Intent
User wants to upload identity card, passport, KYC verification

## Fields
- idNumber: string (身分證字號)
- nationality: string (國籍)
- docType: enum (證件類型)
  - ID_CARD: 國民身分證
  - PASSPORT: 護照

## Logic
```javascript
return {
  verified: true,
  risk_level: "LOW",
  id: payload.idNumber
};
```
```

接著直接對 AI Agent 說：
> **「我寫好 `specs/verify_identity.api.md` 了，幫我合成 JIT 路由並跑測試！」**

AI Agent 會依照專案根目錄的 [SKILL.md](file:///home/toby/documents/projects/jit-api/SKILL.md) 守則：
1. 自動驗證 Markdown 語法完整性。
2. 自動由 `MDLoader` 掛載至伺服器引擎。
3. 自動發送測試請求驗證 Phase 1 意圖匹配。
4. 連續發送觸發凍結，並為您產出嚴謹的 TypeScript Zod、Python Pydantic 與 Go Protobuf 合約！

---

## 4. 程式碼整合：在 Node.js 中使用 `MDLoader`

如果您希望在自己的 Express 或 Node.js 專案中引入 MD-API：

```typescript
import { JITEngine, MDLoader } from 'jit-api';

const engine = new JITEngine();

// 建立 Loader，指定 specs 資料夾路徑
const mdLoader = new MDLoader('specs');

// 自動讀取並掛載所有 *.api.md 規格
const loaded = mdLoader.loadAll(engine);
console.log(`成功掛載 ${loaded.length} 支 Markdown API！`);

// 啟動自動熱監視 (存檔自動無縫更新，無需重啟伺服器)
mdLoader.watch(engine);
```

---

## 5. 原生支援 Model Context Protocol (MCP)

Server 端不僅提供 REST API，還能**直接將所有 `specs/*.api.md` 自動轉換為原生 MCP Tools**！

### 為什麼這與 FastMCP / FastAPI 概念完全契合？
FastMCP (Python) 與我們現在的 `MCPAdapter` (TypeScript) 原理完全相通：
1. **Tool Name**：由 `# API: {name}` 決定。
2. **Tool Description**：由 `> {description}` 與 `## Intent` 自動合成。
3. **Tool Input Schema**：由 `## Fields` 自動轉為嚴謹的 JSON Schema / Zod 型態。
4. **Tool Handler**：直接進入 JIT 引擎執行，享有 Phase 1 語意萃取與 Phase 3 靜態極速！

### 如何讓 Claude Desktop 或 Cursor 連接本伺服器？
當伺服器啟動時，MCP SSE 端點即時在背景運行：
* **SSE 協議入口**：`http://localhost:3005/sse`
* **訊息接收入口**：`http://localhost:3005/messages`

在 `claude_desktop_config.json` 或 Cursor MCP 設定中加入：
```json
{
  "mcpServers": {
    "jit-api": {
      "url": "http://localhost:3005/sse"
    }
  }
}
```
Claude 或 Cursor 連線後，即可直接在對話中調用您在 `specs/` 裡寫的任何 API 工具！

---

## 6. 改完 Markdown 是「自動動態調整」還是「需要跟 Agent 說」？

這是一個非常重要的架構觀念，答案是：**「運行時完全自動動態調整；需要靜態型態代碼時才跟 Agent 說」**。

### 情況 A：運行時（Runtime / 伺服器與儀表板端）➔ 【100% 全自動動態調整】
* **自動檔案監視（File Watcher）**：
  只要您在 VS Code、網頁儀表板或任何地方存檔了 `specs/*.api.md`，伺服器內建的 `mdLoader.watch` 就會在 0.2 秒內**自動無縫熱加載**，新欄位與新邏輯立刻生效，**完全不需要重啟伺服器，也不需要呼叫 Agent！**
* **無痛自我演進（Schema Drift Fallback）**：
  如果原本端點已經凍結在 v1，而您在 Markdown 增加了新欄位（例如 `couponCode`），Client 一送新資料，JIT 靜態驗證失敗後會**自動降級（Fallback）回 Phase 1**，由端側小模型 Needle / TypeSafe 順利接手處理，保證業務**零中斷**！

### 情況 B：編譯期（Compile-Time / 強型別產出）➔ 【建議跟 Agent 說一聲】
* 如果前端或後端工程師希望**「我剛改完 MD，希望馬上有一套強型別的 TypeScript Zod 型態或 Python Pydantic Model 讓 IDE 能夠自動補全（Auto-Complete）」**：
* 此時只要對 AI Agent 說：
  > *「我剛剛改了 `specs/create_order.api.md`，幫我重新編譯合約並跑測試！」*
* Agent 就會直接執行 `CodegenEngine`，一次性將最新的 `create_order.ts`、`create_order.py` 產出至 `generated/` 目錄並跑完單元測試！

---

## 7. Dev 與 Prod 雙模式開發架構

為了兼顧「本機快速除錯、觀測實驗」與「線上高可用、絕對資安防護」，`jit-api` 採用雙模式架構：

| 模式項目 | 🛠️ 開發模式 (`npx jit-api dev`) | 🔒 生產模式 (`npx jit-api start`) |
| :--- | :--- | :--- |
| **啟動指令** | `npx jit-api dev` (或 `./run.sh`) | `npx jit-api start` (或 `npx jit-api prod`) |
| **預設連接埠** | `3005` (可透過 `--port` 自訂) | `3000` (或環境變數 `PORT`) |
| **API 載入範圍** | 全部載入（包含 `Stage: dev` 草稿與 `Stage: prod`） | **僅載入 `Stage: prod` 規格**（未就緒草稿絕不流出） |
| **Web 觀測儀表板** | ✅ 完整啟用 (`http://localhost:3005`) | ❌ 預設不提供除錯介面（純極速網關） |
| **Web 終端機 (PTY)**| ✅ 啟用 (`/ws/terminal`)，便於本機偵錯 | 🚫 **強制停用**（消除 RCE 遠端指令注入風險） |
| **線上規格覆寫** | ✅ 允許 (`POST /api/specs/:file`) | 🚫 **強制阻絕** (回傳 403 Forbidden) |
| **檔案變更熱重載** | ✅ 即時檔案監視 (File Watcher) | ⚠️ 手動重載或由發布/降版流程觸發 |

### 實務開發工作流：
1. **本地開發新 API**：
   在規格頂部註記 `Stage: dev`，在本機 `http://localhost:3005` 進行語意測試與欄位校驗。
2. **審核發布上線**：
   將標籤改為 `Stage: prod`，執行 `npx jit-api release <version>`，生產伺服器即可直接承接外部流量！

---

## 8. 版本控管、快照封存與秒級無縫降版 (Instant Rollback)

當 Markdown 定義了線上生產 API 時，若最新改動在線上遇到未預期的例外狀況，必須能**秒級降版還原**。

### 1. 建立版本發布快照 (Release Snapshot)
在部署或測試驗證完成後，執行：
```bash
npx jit-api release 1.0.0 "初次生產環境穩定發布"
```
* 系統會自動將當前規格備份至 `.jit/releases/v1.0.0/`，並記錄發布清單 `manifest.json` 與時間戳記。

### 2. 事故緊急秒級回滾 (Instant Rollback)
若最新版上線後發現異常，無需等待 CI/CD 重新構建打包，直接於終端機執行：
```bash
npx jit-api rollback 1.0.0
```
* **零停機熱替換 (Zero-Downtime)**：
  1. 系統瞬間自 `.jit/releases/v1.0.0/` 還原正確版本的規格。
  2. JIT 引擎在 **0.2 秒** 內無縫熱加載記憶體中的路由與邏輯。
   3. **服務完全不中斷、連線不被重置、無須重啟伺服器進程**！

---

## 9. v1.2.0 企業級安全架構與自動化測試 (Enterprise Security & Testing)

### 9.1 S1 & U2: `node:vm` 隔離沙盒與真實行號定位
* **資安防線**：`## Logic` 代碼不再以自由權限的 `new Function` 執行，而是運行於 `node:vm` 隔離沙盒。
  - 阻斷 `process`、`process.env`，防止伺服器環境變數外洩。
  - 封鎖 `require`、`import`、動態字串代碼生成（`eval`），杜絕 RCE 遠端指令注入。
  - 設定 **3000ms 執行超時**，防止 `while(true)` 無限迴圈導致伺服器 Event Loop 假死。
* **真實行號對齊**：透過 `vm.Script` 的 `lineOffset` 與 `filename`，執行期報錯的 Stack Trace 會精確指向 Markdown 原始檔案的對應行號（例如 `order.api.md:32`），開發者可直接於 IDE 點擊跳轉。

### 9.2 S2: 規格級宣告式鑑權 (`## Auth`)
可在規格中直接宣告驗證規則，不符規則者於進入 `## Logic` 前即被阻絕並回傳 HTTP 401：

* **Bearer Token 範例**：
  ```markdown
  ## Auth
  type: bearer
  token: sk-jit-secret-token
  ```
* **自訂 Header 與環境變數範例**：
  ```markdown
  ## Auth
  type: api-key
  header: x-service-key
  envVar: PROD_SERVICE_KEY
  ```

### 9.3 S3: Prod 模式物理隔離
生產模式下，後端 Express 路由表會徹底移除 `/api/specs*`、`/api/contracts`、`/api/releases` 以及 `/api/bench/k6`，攻擊者無法透過 `curl` 等工具探測規格原始碼。

### 9.4 S4: 快照 SHA-256 簽名與防篡改降版
* 每次執行 `npx jit-api release <version>` 時，系統會自動計算所有規格檔案的 SHA-256 雜湊並寫入 `manifest.json`。
* 執行 `npx jit-api rollback <version>` 時，系統於還原前逐一比對檔案雜湊，若快照曾遭竄改將立即拋出 `[Security Alert]` 並中斷降版操作。

### 9.5 U3: `npx jit-api test` 一鍵自動化規格測試套件
無需額外撰寫測試程式碼，直接根據 `specs/*.api.md` 內的 `## Sample` 定義執行端到端檢驗：
```bash
npx jit-api test
```
* **Fast-Path 檢驗**：使用 `samplePayload` 驗證 Phase 3 快速路徑與邏輯正確性。
* **語意意圖檢驗**：使用 `sampleSemantic` 驗證 Phase 1 自然語言意圖辨識與欄位正規化。
* **彩色報表產出**：即時輸出每支規格的測試狀態、耗時與斷言統計。
