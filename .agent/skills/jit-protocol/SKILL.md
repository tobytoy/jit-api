---
name: jit-protocol-framework
description: >-
  Comprehensive guide and runbook for AI Agents (Cursor, Windsurf, Claude Code, Antigravity)
  working with the JIT Protocol Synthesis Framework (jit-api). Covers dynamic-to-static
  API lifecycle, Markdown specification syntax, CLI commands, plugins ecosystem, and
  complete tagged version history (v1.1.1 through v1.4.1).
---

# JIT Protocol Synthesis Framework - Agent Master Guide

本手冊指導 AI Agent（如 Cursor, Windsurf, Claude Code, Antigravity）如何在本專案中理解架構、開發新功能、撰寫規格、調度外掛，以及查詢歷代版本演進。

---

## 1. 核心理念與三態循環 (Core Philosophy & Lifecycle)

傳統開發中，前後端與跨微服務通訊需提早定義繁雜的 Protobuf 或 OpenAPI Schema，造成溝通修改成本極高；而直接使用 LLM 解析 JSON 則面臨高延遲（High Latency）與幻覺（Hallucination）。

**JIT-API 的核心價值在於：對人類與 Agent 最友善的微調體驗（修改 Markdown 或一句話交代）＋ 極限自動化自適應與極速結晶。**

### 三態生命週期循環：
1. **Phase 1 (語意熱啟動期 - Dynamic)**：
   開發者以自然語言宣告意圖或撰寫 Markdown，客戶端發送鬆散 JSON，由 TypeSafe (Jev) 或 Cactus Needle 進行毫秒級 Intent 路由、Enum 選取與安全護欄 (Noul)。
2. **Phase 2 (觀察與雙向推斷期 - Observing)**：
   背景 `SchemaObserver` 同時統計 Request 與 Response 的欄位結構、型態與信心度。當連續 N 次（預設 5 次）樣本一致時，自動觸發 Freeze。
3. **Phase 3 (極速靜態期 - Frozen 0ms)**：
   調用 `CodegenEngine` 與程式碼積木（`blocks/`），輸出強型別 TypeScript (Zod)、Golang (.proto / Struct) 與 Python (Pydantic / FastAPI)，切換至 **0ms 靜態 Fast-Path**。
4. **自適應容錯修復 (Auto-Repair on Fallback)**：
   當客戶端突然改送 camelCase（如 `userId` ↔ `user_id`）、字串型態數字或欄位別名時，`FallbackHandler` 在記憶體自動對齊修復，保證後端 **100% 零崩潰**。
5. **多版本共存 (Multi-Version Union)**：
   新舊版本（v1、v2）在 Phase 3 同時並存，徹底杜絕灰度發布（Canary）時的「乒乓漂移（Ping-Pong Drift）」。
6. **快照持久化 (Snapshot Persistence)**：
   自動保存至 `.jit/schemas.json`，重啟伺服器瞬間載入，開機第 1 個請求就是 0ms 靜態響應。

---

## 2. AI Agent 開發守則與 Markdown 規格速查

當使用者要求「新增一個 API」或「修改某個業務欄位」時：
* **最佳實踐**：**在 `specs/` 目錄新增或修改 `*.api.md` 規格書**。
* 伺服器自帶 `MDLoader` 熱加載（Hot-Reload），存檔後立即生效，無需手動重啟。

### Markdown API 完整規格範本：

```markdown
# API: create_order
Version: 1.4.1
Stage: prod
> 處理使用者下單、扣款與訂單成立，並自動推播至通訊頻道

## Intent
User wants to buy, purchase, checkout or order items and products

## Auth
- Type: bearer
- Role: user
- Header: Authorization

## RateLimit
- Max: 60
- Window: 60s

## Fields
- item: string (購買商品名稱)
- amount: number (結帳金額，正整數)
- customerId: string (會員編號)
- paymentMethod: enum (付款方式)
  - CREDIT_CARD: 信用卡
  - LINE_PAY: 行動支付
  - BANK_TRANSFER: 銀行轉帳

## Upstream
- Target: https://payment-service.internal/api/charge
- Method: POST
- Timeout: 5000

## Notify
- Target: ${LINE_ALERT_GROUP_ID}
- Channel: line
- Condition: result.status === 'CONFIRMED'
- Template: 🚀 訂單 {order_id} 成功成立，金額 NT${amount}！

## Sample
- Semantic: 我想訂購一台 MacBook，刷信用卡，金額是 89000 元
- Payload:
```json
{
  "item": "MacBook Pro M4 Max",
  "amount": 89000,
  "customerId": "CUST-8888",
  "paymentMethod": "CREDIT_CARD"
}
```

## Mock
- order_id: uuid
- status: enum [CONFIRMED, PROCESSING]
- createdAt: iso_date

## Logic
```javascript
// 執行於安全 VM 沙盒中，支援 context 上下文
return {
  order_id: "ORD-" + Math.floor(Math.random() * 900000 + 100000),
  status: "CONFIRMED",
  item: payload.item,
  amount: Number(payload.amount || 0),
  customerId: payload.customerId,
  paymentMethod: payload.paymentMethod,
  timestamp: new Date().toISOString()
};
```
```

---

## 3. CLI 指令完整速查庫

```bash
# 開發與生產
npx jit-api dev                  # 啟動開發控制台 (Web Studio + Terminal + 熱重載, Port: 3005)
npx jit-api prod                 # 啟動生產網關 (物理隔離、關閉終端、高效 Fast-Path, Port: 3000)

# 測試、審計與發布安全
npx jit-api test                 # 自動化執行 specs/ 中所有 ## Sample 測試範例
npx jit-api audit                # 靜態資安掃描 (檢測金鑰洩漏、SSRF、未授權端點、DoS 缺限流)
npx jit-api release <version>    # 建立 Markdown 規格之版本快照與 SHA-256 防篡改簽名
npx jit-api rollback <version>   # 驗簽並秒級回滾至指定歷史版本

# 零後端開發與測試
npx jit-api mock                 # 啟動智慧 Mock Server (REST + ConnectRPC 雙協定)
npx jit-api mock-client          # 發送合成流量驗收後端 (--mode valid | fuzz | chaos)
npx jit-api proxy --target <url> # 旁路錄製 live 流量並自動結晶出規格，目標離線時自動切換數位孿生

# 跨平台導出與專案腳手架
npx jit-api export pages         # 導出純靜態 GitHub / Cloudflare Pages 離線部署包
npx jit-api export openapi       # 導出標準 OpenAPI 3.0.3 JSON 規格檔
npx jit-api scaffold line-liff   # 快速建立 LINE Mini App (LIFF) 前端 + JIT 規格骨架
npx jit-api scaffold line-relay  # 建立 LINE 訊息轉發 Bot 專案 (含宣告式轉發與 Cloudflare 進入點)
npx jit-api scaffold cloudflare  # 快速產生 Cloudflare Workers + wrangler.toml 專案
npx jit-api scaffold firebase    # 快速產生 Firebase Functions 專案
npx jit-api scaffold supabase    # 快速產生 Supabase RLS Schema 專案
npx jit-api init                 # 在當前目錄建立 specs/ 規格目錄與範本
```

---

## 4. 外掛生態系 (Plugin Hub & Adapters)

在程式碼中只需透過 `engine.use(plugin)` 即可掛載外掛：

### 1. 試算表與無程式碼資料庫
- `store-googlesheets` (`GoogleSheetsStorageAdapter`)：
  - 支援 Google Apps Script (GAS) Web App（免 GCP 憑證）與 Google Sheets API v4。
  - 內建 `readRows()`，直接把試算表當 No-Code CMS 或 API 資料庫。
- `store-notion` (`NotionStorageAdapter`)：支援 Notion Database 頁面與屬性存取。
- `store-upstash-redis` (`UpstashRedisStorageAdapter`)：純 HTTP REST 協定，相容 Cloudflare Workers 與 Vercel Edge。
- `store-supabase` / `store-firestore`：支援 Supabase Postgres 與 Firebase Firestore 持久化。

### 2. 通訊與宣告式推播頻道
- `channel-line`：LINE Webhook HMAC-SHA256 驗簽與 Reply / Push 推送。
- `channel-discord`：Discord Webhook 與 Rich Embeds 卡片。
- `channel-telegram`：Telegram Bot API 訊息推播。
- `channel-slack`：Slack Webhook 與 Block Kit 結構化排版。

### 3. 身分驗證與進階 RBAC 資安守門
- `auth-rbac-jwt`：
  - **加密簽名驗證**：支援 HS256 (HMAC-SHA256) 與 RS256 (RSA-SHA256) 常數時間比對（`timingSafeEqual` 防止時序攻擊）。
  - **Token 撤銷與 JTI 黑名單**：支援即時撤銷 Token（內建記憶體 TTL 清理與外掛式 Redis 介面）。
  - **Action 級別細粒度 RBAC**：支援操作權限通配符（如 `orders:*`、`billing:refund`、`*:read`）與角色權限對應矩陣（Role-to-Permission Matrix）。
- `auth-supabase` / `auth-line` / `auth-firebase` / `auth-clerk`：快速驗證各主流身分提供者 JWT。
- `guard-safety`：Prompt Injection 攔截 + 台灣在地化個資脫敏（電話、身分證、信用卡、Email）。
- `guard-spec-linter`：靜態資安 SAST 掃描，升級 `SEC-006` 混淆字串還原檢測（如 `'child_' + 'process'`）、原型攀爬防禦（`constructor` / `__proto__` / `globalThis`）與動態解碼攔截（`atob`）。
- `tool-webhook-replay`：Webhook 流量循環記錄器與一鍵重發除錯工具。

### 4. 企業級可觀測性與分散式追蹤 (Observability & Tracing)
- `observability-prometheus` (`createPrometheusPlugin`)：
  - 標準 OpenMetrics / Prometheus 0.0.4 格式 `/metrics` 匯出端點。
  - P50、P90、P99 請求延遲分位數（Summary）、延遲直方圖桶位（Histogram Buckets）、AI 推理延遲、凍結路由儀表（Gauges）與漂移次數計數器。
  - 內建 `createMetricsHandler()`，支援 Express、ConnectRPC 與原生 Node.js HTTP 伺服器掛載。
- `observability-opentelemetry` (`createOpenTelemetryPlugin`)：
  - 完整相容 W3C TraceContext（`traceparent: 00-${traceId}-${spanId}-01`）。
  - 階層化 Spans：`jit.request`（根請求）、`jit.route`（路由匹配）、`jit.logic_execution`（沙盒邏輯）、`jit.upstream_fetch`（上游代理）。
  - 支援 `InMemorySpanExporter`、`ConsoleSpanExporter` 與自訂 OTLP 匯出。

---

## 5. 歷代版本演進史 (Version History & Tag Matrix)

本專案自開源以來經歷多次重大架構升級，歷代 Git Tag 版本演進記錄如下：

| 版本 Tag | 發布日期 | 核心升級與解決痛點 | 關鍵新增模組 / 功能 |
| :--- | :--- | :--- | :--- |
| **`v1.1.1`** | 2026-09 | **修復與穩定性加固**<br>解決 MCPAdapter 在生產環境的 stage 洩漏、伺服器連接埠碰撞自動重試、生產環境關閉 Terminal、Rollback 孤兒檔案隔離。 | `core/mcp_adapter.ts`<br>連接埠重試邏輯<br>Rollback 簽名校驗 |
| **`v1.2.0`** | 2026-09 | **沙盒隔離與安全性防禦**<br>引進 Node.js VM 沙盒執行使用者邏輯，杜絕主行程崩潰；引入 `## Auth` 規格層級驗證；生產環境物理隔離 specs；SHA-256 防篡改規格版本快照；自動化規格測試器（`SpecTestRunner`）。 | `core/sandbox.ts`<br>`core/types.ts` (`AuthDefinition`)<br>`core/test_runner.ts` (`SpecTestRunner`) |
| **`v1.3.0`** | 2026-09 | **三合一協定與自動修復結晶**<br>全面支援 ConnectRPC（Connect / gRPC-Web / gRPC 5-byte Framing）；AI 自動容錯對齊（`AutoRepairer` 大小寫與轉型修復）；快照持久化（`.jit/schemas.json` 重啟即 0ms）；雙向推斷；多版本聯集共存。 | `core/connect_adapter.ts`<br>`core/auto_repair.ts`<br>`core/schema_store.ts`<br>`core/observer.ts` (Multi-version) |
| **`v1.4.0`** | 2026-09 | **企業級 Master Hub、數位孿生與多角色協同**<br>Hugging Face Spaces 部署支援；Master 管理者防暴力登入；Upstream SSRF 防禦代理；多租戶滑動窗口 429 限流；LINE 控制中心結合 TypeSafe Jev 三維指標（重要性/急迫性/危險性）工單派發；Smart Mock Server、Mock Client 與 Proxy Recorder 數位孿生。 | `core/master_auth.ts`<br>`core/upstream_client.ts`<br>`core/rate_limiter.ts`<br>`core/line_service.ts`<br>`core/mock_server.ts`<br>`core/proxy_recorder.ts` |
| **`v1.4.1`** | 2026-09 | **部署轉接器、宣告式轉發與外掛生態中樞**<br>GitHub/Cloudflare Pages 離線包導出器；OpenAPI 3.0.3 導出；Cloudflare Worker / Firebase 轉接器；LIFF / Relay 專案腳手架；Plugin 架構（Google Sheets, Notion, Upstash, Discord, Telegram, Slack, Clerk, Firebase）；宣告式 `## Notify`；靜態資安審計（`npx jit-api audit`）。 | `core/plugin.ts`<br>`adapters/*`<br>`plugins/*`<br>`core/jit_engine.ts` (`dispatchDeclarativeNotify`)<br>`plugins/guard_spec_linter.ts` |
| **`v1.4.2`** | 2026-09 | **外掛生態擴充、試算表資料庫、靜態資安稽核**<br>Google Sheets 試算表資料庫 (No-Code CMS)；Notion / Upstash Redis 儲存；Discord / Telegram / Slack 全通路告警轉發；Firebase / Clerk 認證；Prompt Injection 阻斷與台灣個資脫敏；靜態資安 SAST 稽核 (`npx jit-api audit`)；Agent Master Guide。 | `plugins/store_googlesheets.ts`<br>`plugins/channel_*`<br>`plugins/guard_safety.ts`<br>`plugins/guard_spec_linter.ts`<br>`.agent/skills/jit-protocol/` |
| **`v1.4.3`** | 2026-09 | **企業級可觀測性、細粒度 RBAC、沙盒深度硬化與 Redis 防投毒 (Hardening)**<br>Prometheus `/metrics` 匯出端點 (P50/P90/P99 延遲直方圖)；OpenTelemetry W3C TraceContext 分散式追蹤；HS256/RS256 加密驗簽與 JTI 黑名單；Action 級別通配符 RBAC；Node.js VM 沙盒原型硬隔離 (Null-Prototype / Realm JSON Deserialization / 嚴格模式禁用 this) 與 SEC-006 混淆逃逸檢測；`SchemaStore` 與 `SignedStorageAdapter` 密碼學 HMAC-SHA256 簽名防止全叢集合約投毒 (Anti-Poisoning)。 | `plugins/observability_prometheus.ts`<br>`plugins/observability_opentelemetry.ts`<br>`plugins/auth_rbac_jwt.ts`<br>`core/md_parser.ts` (Harden Sandbox)<br>`plugins/guard_spec_linter.ts` (SEC-006 De-obfuscation)<br>`core/schema_store.ts`<br>`core/signed_storage.ts` |

---

## 6. 資安防護準則與安全發布最佳實踐 (Security Guidelines & Guardrails)

為確保微服務在真實網路環境與分散式叢集下的絕對安全，AI Agent 在產生規格、編寫外掛與建置系統時，必須遵循以下資安守則：

### 1. Markdown 規格安全撰寫原則
* **敏感端點強制驗證**：若 API 路由涉及敏感行為（如 `admin`、`delete`、`pay`、`refund`、`config`、`withdraw`），必須在規格中定義 `## Auth` 區塊，切勿開放匿名存取。
* **全域限流守則**：所有公開對外路由建議配置 `## RateLimit`（例如 `max: 60, window: 60s`），杜絕惡意 DoS 與 LLM Token 成本耗盡攻擊。
* **機敏資訊隔離**：規格中禁止硬編碼真實 API 金鑰、密碼或真實個資（PII）；範例資料必須使用 `alice@example.com` 或脫敏字串。

### 2. 靜態資安審查與發布前自檢 (SAST Audit)
Agent 在提交變更或執行發布前，**必須執行資安審計指令**：
```bash
npx jit-api audit       # 靜態掃描 specs/ 內所有 Markdown 規格的潛在資安漏洞
npx jit-api lint-spec   # 同義別名，適合 CI/CD Pipeline 阻斷合流
```
審查規則包含：
- **`SEC-001`**：硬編碼金鑰、JWT 與雲端 Token 洩漏檢測。
- **`SEC-002`**：SSRF 防護（全面封鎖 `127.0.0.0/8`、`169.254.169.254` 雲端 Metadata、CGNAT、IPv6 本地網段）。
- **`SEC-003`**：未受保護的敏感端點（Missing `## Auth`）。
- **`SEC-004`**：未配置限流的路由（Missing `## RateLimit`）。
- **`SEC-005`**：真實個資（身分證字號、信用卡號、手機號碼）。
- **`SEC-006`**：危險底層呼叫、動態混淆字串（`'child_' + 'process'`）、原型攀爬（`__proto__`, `constructor`）與動態解碼（`atob`）攻擊。

### 3. 外掛與快取防投毒防禦 (Anti-Poisoning & Hardening)
* **分散式快取簽名**：使用 Upstash Redis 或多節點快取時，請設定 `signingSecret` 或環境變數 `JIT_STORAGE_SIGNING_SECRET`。系統將自動透過 `SignedStorageAdapter` 注入 HMAC-SHA256 簽名，防止 Redis 內容遭惡意竄改導致全叢集合約中毒。
* **時序攻擊防禦 (Timing-Safe Equality)**：所有 Webhook（LINE、GitHub、自訂 HMAC）簽名比對一律採用 `crypto.timingSafeEqual` 常數時間運算，杜絕計時側信道攻擊。
* **主動式防護網**：啟用 `createSafetyGuardPlugin()`，其 `beforeRouteExecution` 生命週期攔截器會自動於請求前置階段阻斷 Prompt Injection / Jailbreak 攻擊，並自動脫敏敏感個資。
* **生產環境隔離**：生產環境務必宣告 `NODE_ENV=production`，以確保第三方認證外掛（Clerk、Firebase）之測試用 Mock Token 無法在正式環境中被惡意繞過。
