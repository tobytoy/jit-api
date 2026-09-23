# JIT-API 更新日誌 (Changelog)

所有關於 JIT-API 的重大更新、功能增強與架構演進皆記錄於此文件。本專案嚴格遵循 [語意化版本 2.0.0 (SemVer)](https://semver.org/lang/zh-TW/) 規範。

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

### 🧪 驗證與測試覆蓋
* 新增 6 組專屬測試套件：
  1. `test/multi_version_coexistence.test.ts`
  2. `test/auto_repair.test.ts`
  3. `test/strict_evolve_drift.test.ts`
  4. `test/schema_persistence.test.ts`
  5. `test/connect_binary_proto.test.ts`
  6. `test/bidirectional_schema.test.ts`
* 全套 18 個測試檔案（共 51 項測試）全數 100% 通過。

---

## [v1.2.0] - 2026-09-22
* 整合 ConnectRPC Triple-Protocol Adapter（Connect Protocol v1、gRPC-Web、gRPC）。
* 增加 `docs/connectrpc_guide.md` 與端對端客戶端調用範例。

## [v1.1.0] - 2026-09-20
* 整合 Needle 本地離線推論引擎，實現無 API Key 時的完全解耦與自包含運作。
* 增加 Node.js VM 沙盒執行環境與行號追蹤機制。
