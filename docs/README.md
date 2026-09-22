# JIT Protocol Synthesis (JIT-API) 使用者指南與全套文件庫

歡迎閱讀 **JIT 協定合成框架（Just-In-Time Protocol Synthesis）** 完整開發與操作指南。  
本文件夾涵蓋 **新版極簡用法（Markdown API + Web 儀表板 + k6 壓測）** 與 **底層代碼整合方式（TypeScript Express & Python FastAPI）**。

---

## 🌟 快速導覽：根據您的角色選讀

```text
                                JIT-API 2.0 文件導覽
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        ▼                                                                 ▼
【新版極簡用法 (推薦)】                                            【底層代碼整合 (進階)】
適合 PM、前端、全端與 AI Agent 協作                                適合框架維護者與自訂後端
        │                                                                 │
        ├─► [1. Markdown 標記式 API 指南](./md_api_guide.md)              ├─► [3. Server 端整合指南](./server_guide.md)
        │   (如何寫 specs/*.api.md 與對 Agent 說話)                       │   (Express & FastAPI 底層代碼)
        │                                                                 │
        └─► [2. Grafana k6 壓力測試指南](./benchmark_guide.md)            └─► [4. Client 端調用指南](./client_guide.md)
            (Web 一鍵壓測與 1,300+ RPS 實測解析)                              (Phase 1~3 & Schema Drift 調用)
```

---

## 📚 文件目錄索引

### 1. 🚀 [Markdown 標記式 API (MD-API) 與 Agent 協同指南](./md_api_guide.md)
* **核心理念**：「工程師/PM 只需寫 Markdown，Agent 搞定所有代碼，使用者 `./run.sh` 開箱即用」。
* **語法手把手教學**：`# API`, `## Intent`, `## Fields`, `## Logic` 規範。
* **規格目錄管理**：`specs/*.api.md` 動態熱加載（Hot-Reload）機制。
* **Agent 協作工作流**：如何對 AI Agent 說一句話自動完成合成、測試與凍結。

### 2. ⚡ [Grafana k6 壓力測試與前端控制台指南](./benchmark_guide.md)
* **Web 儀表板一鍵壓測**：VUs 並發與秒數自訂，即時產生 RPS 與延遲階梯分佈。
* **CLI 終端機壓測**：內建綠色免安裝版 `bin/k6` 調用方式。
* **效能躍升解析**：實測 Phase 3 達成中位數 **0.47ms** 延遲、**1,300+ RPS** 與 **0ms AI 運算延遲**。

### 3. 🖥️ [Server 端整合指南 (底層程式碼)](./server_guide.md)
* 如何在 TypeScript (Express) 與 Python (FastAPI) 中直接引入 `JITEngine`。
* 裝飾器與物件式端點宣告、雙引擎配置（TypeSafe 雲端引擎 vs Needle 本地離線引擎）。
* 觀測凍結機制與多語言合約代碼生成。

### 4. 📱 [Client 端調用指南 (前端與跨服務通訊)](./client_guide.md)
* **Phase 1（熱啟動期）**：前端 / Client 傳送自然語言或鬆散 JSON。
* **Phase 2（演進期）**：結構趨向穩定，觸發伺服器自動凍結。
* **Phase 3（極速期）**：Client 端如何使用自動產出的 TypeScript 型態或 Protobuf 達成 0ms AI 延遲。
* **Schema Drift（演化期）**：Client 業務變更傳送新規格時的無痛過渡。

### 5. 💻 [可直接執行的程式碼範例 (`docs/examples/`)](./examples/)
* [docs/examples/ts_server.ts](./examples/ts_server.ts) — 整合 Web Dashboard、k6 壓測與 MD 規格的 Express 伺服器
* [docs/examples/ts_client.ts](./examples/ts_client.ts) — TypeScript 全生命週期客戶端測試腳本
* [docs/examples/py_server.py](./examples/py_server.py) — Python FastAPI + JITEngine 伺服器
* [docs/examples/py_client.py](./examples/py_client.py) — Python 客戶端調用示範腳本

---

## ⚡ 核心生命週期互動圖

```text
========================================================================================
[Phase 1: 語意熱啟動期 (Dynamic)]
Client: 發送任意非結構化 JSON 或自然語言（如帶 message、未對齊 key）
Server: Needle (本地小模型) 或 TypeSafe (雲端 Jev) 進行意圖路由與欄位正規化，執行 Handler
----------------------------------------------------------------------------------------
                                      ⬇
[Phase 2: 流量觀測與自動凍結 (Observation & Freeze)]
Client: 連續發送格式一致的資料
Server: SchemaObserver 統計穩定度達標 (預設連續 3~5 次) ➔ 觸發 Freeze
        自動編譯產出 TypeScript (Zod)、Go (.proto)、Python (Pydantic) 檔案至 generated/
----------------------------------------------------------------------------------------
                                      ⬇
[Phase 3: 傳統極速期 (Static Fast-Path)]
Client: 發送符合規格的 JSON（可直接 import 產出的型態）
Server: 本地靜態驗證器 (Zod / Pydantic) 瞬間通過 ➔ 0 毫秒 AI 延遲、突破千級 RPS 極速響應！
----------------------------------------------------------------------------------------
                                      ⬇
[Schema Drift: 業務變更自主演進 (Fallback & Self-Evolution)]
Client: 業務邏輯更新，傳入新型態或新增欄位（靜態驗證失敗）
Server: 自動降級回 Phase 1 處理請求 ➔ 開啟 v2 觀測 ➔ 服務零中斷，合約自動更新！
========================================================================================
```
