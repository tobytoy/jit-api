# JIT-API 更新日誌 (Changelog)

所有關於 JIT-API 的重大更新、功能增強與架構演進皆記錄於此文件。本專案嚴格遵循 [語意化版本 2.0.0 (SemVer)](https://semver.org/lang/zh-TW/) 規範。

---

## 🚀 [v1.5.0] - 2026-09-24

### 🌟 重大架構演進：Hugging Face Spaces 部署支援、Master 登入保護、Upstream 轉接安全、多租戶頻率限制與 LINE 多角色 Jev 重要度分流

本版本專注於**企業級 API 分享中心 (Master Hub)** 的雲端落地與安全防護，實現無縫託管於 Hugging Face Spaces，並結合多租戶隔離與 AI Coding Agent 自主派工：

---

### 1. ☁️ Hugging Face Spaces 零成本託管與雲端環境自動偵測
* **自動 Port 7860 綁定**：`run.sh` 與伺服器自動辨識 `SPACE_ID` / `SPACE_HOST`，免配置直接掛載 HF Spaces。
* **HF Secrets 零洩漏架構**：`.gitignore` 嚴格排除 `.jit/upstream_secrets.*`、`.jit/apikeys.json`、`.jit/tenants.json`，第三方機密統一由 HF Secrets 透過 `UPSTREAM_<REF>` 注入並在前端自動遮罩。
* **外網一鍵分享支援**：`run.sh --share` 支援 Cloudflare Tunnels / Localtunnel 快速穿透分享。

---

### 2. 🛡️ Master 管理者身分認證與暴力破解防禦
* **常數時間安全對比**：採用 `crypto.timingSafeEqual` 阻擋時間差計時側信道攻擊。
* **連續失敗鎖定**：若連續 5 次密碼錯誤，系統自動鎖定該來源 IP 15 分鐘，抵禦暴力字典攻擊。
* **Express 守衛中介軟體**：規格修改、SHA-256 回滾、k6 壓測、工單核准與 Web Terminal 終端機全面受 `masterAuth.requireMaster` 嚴密保護。

---

### 3. 🌐 Upstream 第三方加值轉接與 SSRF 安全防禦
* **Markdown 宣告式轉接**：支援在規格書宣告 `## Upstream` 與 `## Limits`，虛擬機直接注入 `ctx.upstreamFetch()`。
* **SSRF 內網攻擊攔截**：全面阻擋 `localhost`, `127.0.0.1`, RFC1918 私有網段 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) 與雲端 Metadata IP (`169.254.169.254`)。
* **記憶體快取 (TTL)**：預設 60 秒記憶體快取，重複查詢耗時 0ms，大幅降低第三方 API 調用配額與成本。

---

### 4. 👥 多租戶 API Key 與 Sliding-Window 429 速率限制
* **租戶角色隔離**：支援 `master`, `pm`, `client`, `dev` 四種身分。
* **路由授權白名單**：Client 僅能存取其 `allowedRoutes`，其餘端點回傳 403。
* **精準速率限制**：滑動窗口演算法 (Sliding-Window)，超出配額時回傳 HTTP 429 與 `retryAfterSeconds`。

---

### 5. 📱 LINE 多角色協同、Jev 三維評定指標 (重要性/急迫性/危險性) 與 AI Agent 派工
* **客戶端點隔離**：Client 在 LINE 僅能看到與查詢自己被授權的 API；PM 可提新需求並全域測試。
* **Jev 三維評定指標 (Three-Metric Evaluation)**：
  * **🌟 重要性 (Importance, 0–100 & HIGH/MED/LOW)**：業務價值、客戶影響範圍與角色加權（PM 80分、客戶 75分、核心關鍵字 +15分）。
  * **⏰ 急迫性 (Urgency, 0–100 & CRITICAL/HIGH/MED/LOW)**：時效性與線上故障阻斷（500/Crash/阻斷 95分 CRITICAL、緊急/今天 85分 HIGH、延後 25分 LOW）。
  * **⚠️ 危險性 (Risk / Breaking Hazard, 0–100 & HIGH/MED/LOW)**：破壞性變更衝擊（刪改欄位/型態變更 80~100分 HIGH、修改現有端點 25分 LOW、新增相容端點 10~20分 LOW）。
* **智慧分流與處置建議 (Triage Advice Matrix)**：
  * `DISCUSS_WEEKLY_MEETING` (週會討論)：危險性為 HIGH（破壞性變更），強制列入每週全體對齊例會評審，避免溜溜球效應與客戶端崩潰。
  * `MASTER_DIRECT_HANDLE` (Master 立即處置)：急迫性為 CRITICAL（線上當機）或 HIGH 且低危險（小事自處），Master 當場一鍵批准並熱重載。
  * `AI_AGENT_AUTONOMOUS` (交由 AI Agent 處理)：重要度明確且危險性受控，可直接指派 Claude Code / Codex / Gemini CLI 自動生成 Spec。
  * `REJECT` (建議駁回/暫緩)：需求資訊不足 (`NEED_MORE_INFO`) 或重要性低且無急迫性。
* **一鍵複製 AI Agent 指令**：可一鍵將結構化 Prompt（包含三維指標與處置建議）複製至剪貼簿，直接在終端交由 Claude Code / Codex / Gemini CLI 秒級實作！

---

## 🚀 [v1.4.0] - 2026-09-24

### 🌟 重大架構演進：角色工作台、紅綠燈防溜溜球協同機制、LINE 控制中心與 TypeSafe Jev 審查樞紐

本版本專注於提升前後端多角色團隊的**協同開發體驗**與**高並發溝通效率**，引入「角色工作台」、「紅綠燈防溜溜球協同協議」、「Master 角色與 LINE 需求工單樞紐」以及「基於 TypeSafe Jev 原語的結構化智慧決策」：

---

### 1. 👥 角色導向工作台 (Role-Based Workspaces)
* **Client 端工作台**：專為前端/App/QA 設計，內建 Smart Mock / Digital Twin 零後端模式切換、Chaos 混沌流量生成器、跨語言 Client SDK 預覽與客戶端專用測試 Playground。
* **Server 端工作台**：專為後端架構師設計，整合 Markdown API 即時編輯與熱重載、Phase 1~3 凍結/解凍控制、Grafana k6 壓力測試機、以及 SHA-256 快照版本管理與一鍵回滾。
* **雙端協同總覽 (Overview)**：展示全域路由拓撲矩陣、即時觀測統計與全局協同燈號。

---

### 2. 🚦 紅綠燈協同機制與防溜溜球互斥鎖 (Traffic Light Anti-Yo-Yo Protocol)
* **核心問題**：前後端並行開發時，常發生「前端在驗收，後端突然重構覆寫」或「雙方同時修改導致反覆拉扯（Yo-Yo Effect）」的溜溜球效應。
* **架構升級**：
  * 新增 [`core/coordination.ts`](../core/coordination.ts)（`TrafficLightManager`）。
  * 動態三色燈號狀態機：
    * 🟢 **GREEN (Ready / Synced)**：規格穩定同步，開放雙端自由發送與非破壞性擴充。
    * 🟡 **YELLOW (Negotiating / Drift Evolving)**：檢測到漂移或正在樣本收斂中，提醒雙端注意。
    * 🔴 **RED (Locked / Benchmarking / Active Testing)**：由特定角色持有獨佔操作鎖（具備 TTL 自動過期釋放防死鎖），保護壓測與驗收現場。

---

### 3. 📱 LINE 協同控制中心 & 需求工單看板 (`#TKT-xxxx`)
* **Master-Centric API Hub 設計**：單一 Master 工程師（擁有 `run.sh` 電腦控制權）透過 JIT 引擎同時服務多位 Client / Server 協同者。
* **已知 API 規格自動秒回 (Read-Only FAQs)**：協同者在 LINE 詢問規格（如「查詢 /api/users」），Bot 自動秒回參數型態與紅綠燈狀態，Master 完全零干擾。
* **新需求自動收單立案**：協同者在 LINE 提出增修需求，Bot 自動建立工單 (`#TKT-xxxx`) 並排入審核看板。
* **對話白名單權限管制 (Access Control)**：Master 可在 Web Studio 直接增刪授權 LINE 使用者，杜絕外部無效灌水。
* **內嵌 LINE 互動模擬器 (Chat Simulator)**：免實體 Webhook 網址即可在 Web Studio 即時體驗 LINE 雙向對話、秒回與自動收單流程。

---

### 4. 🤖 TypeSafe Jev 結構化微決策審查核心 (Jev Reviewer)
* **捨棄傳統自由對話式 LLM 幻覺**，全面採用 TypeSafe Jev 三大結構化原語：
  * **`noul`（安全護欄）**：毫秒級過濾惡意 Prompt 注入或異常指令。
  * **`choice`（確定性狀態機）**：強制限定決策結果（`APPROVE_AND_DRAFT_SPEC`, `MODIFY_EXISTING_ENDPOINT`, `NEED_MORE_INFO`, `HIGH_BREAKING_RISK`）。
  * **`score`（破壞性風險評分）**：計算變更之「破壞性風險」與「相容性評分」(0.0 ~ 1.0)。
* **Master 一鍵審閱**：Master 檢視指標卡後，點擊「✅ 批准並一鍵生成 Spec」，JIT 引擎自動將 Jev 起草之補丁寫入 `specs/` 並熱重載入引擎。

---

### 5. 🛡️ 伺服器熱重載與健全錯誤防禦
* 升級 `run.sh` 為 `npx tsx watch docs/examples/ts_server.ts`，代碼修改自動熱重載。
* 前端 `app.js` 引入 `safeApiRequest`，徹底根絕 `Unexpected token '<'` 404 HTML 解析異常。

---

## 🚀 [v1.3.0] - 2026-09-23

### 🌟 重大架構演進：自適應漂移修復、多版本共存、快取持久化與二進位 Protobuf

本版本是一次重大的次版號（Minor Release）升級，在**維持 100% 向下相容**的前提下，全面解決了規格突變時的「自適應修復」、「灰度多版本共存」、「新增欄位漏診」、「重啟後冷啟動重置」、「二進位 Protobuf 高速通道」以及「雙向 Request/Response 結構推斷」等 6 大核心架構問題。

---

### 1. 🔄 多版本共存與防乒乓漂移 (Multi-Version Schema Coexistence)
* **核心問題**：以往當客戶端 A 升級到 v2 規格時，會將路由重置，導致仍在使用 v1 的客戶端 B 頻繁觸發漂移，造成 route 永遠卡在 Phase 1 的「乒乓漂移（Ping-Pong Drift）」。
* **架構升級**：
  * [`core/observer.ts`](../core/observer.ts) 新增 `frozenVersions: Map<string, Map<number, IRSchema>>`，永久保留歷史凍結版本。
  * [`core/jit_engine.ts`](../core/jit_engine.ts) 實作 **Multi-Version Union Validator**，依照版本新到舊（v2 -> v1）依序匹配。
  * **效益**：新版與舊版客戶端能同時並存於 Phase 3，共享 0ms AI 延遲的高速 Fast-Path！

---

### 2. 🛠️ 智慧欄位自適應修復 (Intelligent Schema Auto-Repair)
* **核心問題**：客戶端若更換命名風格（如 `userId` 代替 `user_id`）或送出字串型態數字（如 `"100"`），降級回 Phase 1 時後端 Handler 可能因欄位名稱不符而拋出 500 異常。
* **架構升級**：
  * 新增 [`core/auto_repair.ts`](../core/auto_repair.ts)（`AutoRepairer` 模組）並無縫整合至 [`core/fallback_handler.ts`](../core/fallback_handler.ts)。
  * 自動執行三階段容錯對齊：
    1. **大小寫與分隔符轉換**：`camelCase` / `kebab-case` <-> `snake_case`。
    2. **基本型別強制轉換**：字串數字轉數字、字串布林轉布林、逗號分隔字串轉陣列。
    3. **通用別名映射**：`uid` -> `user_id`、`qty` -> `quantity`、`amt` -> `amount` 等。
  * **效益**：即使規格突變，後端 Handler 依舊能 100% 安全獲取期望資料，執行不中斷，並在 `context.autoRepaired` 留下可審計修復記錄。

---

### 3. 🔍 靈敏漂移偵測與平滑演化 (Diff Watcher & Evolution Mode)
* **核心問題**：Zod 預設會自動剔除（strip）Schema 未定義的欄位，導致客戶端「新增欄位」時驗證依舊過關，新欄位被默默吃掉且無法觸發演化。
* **架構升級**：
  * 在 `JITEngineOptions` 新增 `driftMode` 設定：
    * `'evolve'`（**預設推薦**）：新欄位直接放行傳給後端 Handler，並在背景非阻塞式累積樣本；連續 5 次匹配後自動無縫升級為 vNext Schema，線上服務完全零抖動。
    * `'strict'`：任何未定義的新增欄位均視為 Hard Drift，立即觸發 Fallback 降級。
    * `'lenient'`：完全寬容模式。
  * [`core/observer.ts`](../core/observer.ts) 新增 `observeEvolution()` 專用演化監聽通道。

---

### 4. 💾 Schema 持久化快照（0ms 冷啟動）(Snapshot Persistence)
* **核心問題**：以往每次重啟 Node.js 伺服器，所有路由狀態均歸零，必須重新經歷 5 次請求觀察才能凍結。
* **架構升級**：
  * 新增 [`core/schema_store.ts`](../core/schema_store.ts) 負責管理 `.jit/schemas.json` 快照。
  * `JITEngineOptions` 支援 `persistence: true | { filePath?: string }`。
  * 路由凍結時自動原子寫入硬碟；伺服器重啟時自動還原所有已凍結 Schema 並掛載 Fast-Path。
  * **效益**：達成**開機第 1 筆請求即享 0ms AI 延遲**的極速熱啟動。

---

### 5. ⚡ ConnectRPC 原生二進位 Protobuf 解析 (Binary Envelope Framing)
* **架構升級**：
  * 在 [`core/connect_adapter.ts`](../core/connect_adapter.ts) 實作 Connect 規範的 5-byte Envelope Framing：`[1 byte flag] [4 bytes big-endian length] [payload]`。
  * 支援 `Content-Type: application/connect+proto` 與 `application/proto`。
  * **效益**：微服務間調用與高效能客戶端可跳過 JSON 序列化開銷，直接走二進位通訊通道。

---

### 6. 🧬 雙向結構推斷 (Request + Response Bidirectional Schema)
* **核心問題**：以往 SchemaObserver 僅觀察 Request Payload，Response 僅能以通用結構或字串表達。
* **架構升級**：
  * [`core/observer.ts`](../core/observer.ts) 擴充 `observe(route, req, res, confidence)`，同時推斷 Handler 回傳值結構。
  * 全面升級程式碼生成區塊：
    * **Protobuf 3**：生成強型別 `message [Method]Response { ...fields... }`。
    * **TypeScript**：生成 `[Method]ResponseSchema` 與 `type [Method]Response`。
    * **Python / Pydantic**：生成 `class [Method]Response(BaseModel): ...`。
    * **Go Struct**：生成 `type [Method]Response struct { ... }`。

---

### 7. 🎭 智慧雙向角色切換：Mock Server、Mock Client 與 旁路錄製數位孿生 (Mock & Digital Twin Suite)
* **核心價值**：JIT 不僅能當 API Gateway，更具備扮演 Mock Client（自動生成真實/Fuzz流量測試後端）、Mock Server（零後端讓前端即刻開工）以及 Proxy Recorder（旁路無感錄製 live 流量結晶出 Markdown 規格與斷線數位孿生）的三重角色！
* **架構升級**：
  * **Smart Mock Server**（[`core/mock_server.ts`](../core/mock_server.ts)）：
    * 根據 Markdown 規格（`## Mock`、`## Sample`、`## Fields`）自動產生語意真實的合成資料（UUID、ISO 日期、Email、金額等）。
    * 同時支援 REST (`/api/mock/:route`) 與 ConnectRPC (`/jit.v1.JITService/:method`)。
    * 同樣享有 Phase 1 -> Phase 3 快速結晶能力，前端取得 0ms 靜態回應體驗。
    * CLI 指令：`npx jit-api mock [--port 3005] [--specs ./specs]`。
  * **Smart Mock Client**（[`core/mock_client.ts`](../core/mock_client.ts)）：
    * 支援三大流量注入模式：`valid`（合規合成資料）、`fuzz`（故意更換 camelCase、字串化數字驗收 JIT Auto-Repair）、`chaos`（欄位缺失與異常型別壓力測試）。
    * 自動生成彙總報告（請求數、成功率、延遲與狀態碼分布）。
    * CLI 指令：`npx jit-api mock-client --target <url> [--mode valid|fuzz|chaos] [--count 5]`。
  * **Smart Proxy Recorder & Digital Twin**（[`core/proxy_recorder.ts`](../core/proxy_recorder.ts)）：
    * 旁路攔截真實流量，自動雙向觀察 Request + Response。
    * 連續 3 筆穩定流量即在 `specs/` 自動結晶出 `recorded_<route>.api.md` Markdown 規格檔。
    * **斷線自動容錯（Failover to Digital Twin）**：當真實後端當機或無法連線時，代理自動無縫降級為本地「數位孿生」，回傳快取之最後已知結構，保障前端展示與離線開發不中斷！
    * CLI 指令：`npx jit-api proxy --target http://api.example.com [--offline]`。

---

### 7. 🚦 雙端角色工作台與交通燈號防溜溜球協同機制 (Role Workbench & Traffic Light Protocol)
* **核心問題**：客戶端與伺服端並行開發時，常因一方微調欄位觸發漂移，另一方同時調整規格，造成雙向競態震盪與無限追逐的「溜溜球效應 (Yo-Yo Effect)」。
* **架構升級**：
  * **TrafficLightManager（[`core/coordination.ts`](../core/coordination.ts)）**：
    * 🟢 **綠燈 (SYNCED)**：規格已對齊收斂，雙端皆享有完全編輯與調用權限。
    * 🟡 **黃燈 (NEGOTIATING)**：演進協商中，正在統計樣本或自適應中，提示雙端暫停大幅重構。
    * 🔴 **紅燈 (LOCKED)**：互斥鎖定（Server 壓測中或 Client 錄製中），阻止單方突更，具備自動 TTL 超時保護避免死鎖。
  * **角色切換工作台（Web Studio UI）**：
    * **`👤 Client 工作台`**：零後端 Mock 開發、合成流量壓力注入（Valid / Fuzz / Chaos）、Client SDK 一鍵生成與客戶端互斥鎖。
    * **`🖥️ Server 工作台`**：Markdown API 規格線上編修熱重載、Phase 3 固化鎖定、k6 壓測與版本發布回滾。
    * **`🌐 雙端協同總覽`**：全域路由卡片即時呼吸燈號與雙端協商看板。
  * **LINE Bot 整合架構規劃**：發布 [`docs/line_bot_architecture.md`](./line_bot_architecture.md)，規劃 `./run.sh` 零繁瑣設定自動建立 HTTPS 隧道並打通 LINE Bot 協同對話。

---

### 🧪 驗證與測試覆蓋
* 新增 10 組專屬測試套件：
  1. `test/multi_version_coexistence.test.ts`
  2. `test/auto_repair.test.ts`
  3. `test/strict_evolve_drift.test.ts`
  4. `test/schema_persistence.test.ts`
  5. `test/connect_binary_proto.test.ts`
  6. `test/bidirectional_schema.test.ts`
  7. `test/mock_server.test.ts`
  8. `test/mock_client.test.ts`
  9. `test/proxy_recorder.test.ts`
  10. `test/traffic_light.test.ts`
* 全套 22 個測試檔案（共 63 項測試）全數 100% 通過。

---

## [v1.2.0] - 2026-09-22
* 整合 ConnectRPC Triple-Protocol Adapter（Connect Protocol v1、gRPC-Web、gRPC）。
* 增加 `docs/connectrpc_guide.md` 與端對端客戶端調用範例。

## [v1.1.0] - 2026-09-20
* 整合 Needle 本地離線推論引擎，實現無 API Key 時的完全解耦與自包含運作。
* 增加 Node.js VM 沙盒執行環境與行號追蹤機制。
