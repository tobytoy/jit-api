# JIT Protocol Synthesis (JIT-API) 使用者指南與全套文件庫

歡迎閱讀 **JIT 協定合成框架（Just-In-Time Protocol Synthesis）** 完整開發與操作指南。  
本文件夾涵蓋 **新版極簡用法（Markdown API + Web 儀表板 + k6 壓測）** 與 **底層代碼整合方式（TypeScript Express & Python FastAPI）**。

---

## 🌟 快速導覽：根據您的角色選讀

```text
                                JIT-API 2.0 文件導覽
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
【新版極簡用法 (推薦)】           【容器化一鍵啟動】               【底層代碼整合 (進階)】
適合 PM、前端與 AI Agent 協作     適合不想裝 Node/Python 的人      適合框架維護者與自訂後端
        │                                │                                │
        ├─► [1. Markdown 標記 API](./md_api_guide.md) ├─► [3. Docker 運行指南](./docker_guide.md)    ├─► [4. Server 端整合](./server_guide.md)
        │                                │                                │
        └─► [2. Grafana k6 壓測](./benchmark_guide.md) └───────────────────────────────► └─► [5. Client 端調用](./client_guide.md)
```

---

## 📚 文件目錄索引

### 1. 🚀 [Markdown 標記式 API (MD-API) 與 Agent 協同指南](./md_api_guide.md)
* **核心理念**：「工程師/PM 只需寫 Markdown，Agent 搞定所有代碼，使用者 `./run.sh` 開箱即用」。
* **語法手把手教學**：`# API`, `Version`, `Stage`, `## Intent`, `## Fields`, `## Sample`, `## Logic` 規範。
* **動態範例與智慧推導**：宣告 `## Sample` 自動填入前端與壓測；未宣告時自動依欄位推導假資料。
* **Dev 與 Prod 雙模式隔離**：開發模式 (`dev`, 3005) 載入全部 API；生產模式 (`start`, 3000) 僅載入 `Stage: prod` 並封鎖危險終端。
* **規格目錄管理**：`specs/*.api.md` 動態熱加載（Hot-Reload）機制。

### 2. ⚡ [Grafana k6 壓力測試與前端控制台指南](./benchmark_guide.md)
* **Web 儀表板一鍵壓測**：自由選擇目標 API 端點、自動注入真實 Sample 測試資料、VUs 並發與秒數自訂。
* **CLI 終端機壓測**：內建綠色免安裝版 `bin/k6` 調用方式，支援環境變數指定路由與自訂 Payload。
* **效能躍升解析**：實測 Phase 3 達成中位數 **0.47ms** 延遲、**1,300+ RPS** 與 **0ms AI 運算延遲**。
* **VS Code 風格 Web 終端 (Integrated Terminal)**：網頁底部內建即時 PTY 終端機（支援 zsh/bash、快捷鍵 `Ctrl + \``、快捷指令），實現「上方看網頁、下方直接呼叫 Agent / 跑指令」的一體化極致體驗！

### 3. 🐳 [Docker 一鍵運行指南](./docker_guide.md)
* **零依賴一鍵啟動**：針對不想在電腦安裝 Node.js、Python、Conda 的使用者與團隊。
* **Docker Compose 與 Docker CLI**：單一指令啟動包含 Web 控制台、k6 壓測、PTY 終端機與 MCP 伺服器的完整環境。
* **獨立掛載規格目錄**：透過 `-v $(pwd)/specs:/app/specs`，保證不會污染本地專案的 git 記錄。

### 4. 🖥️ [Server 端整合指南 (底層程式碼)](./server_guide.md)
* 如何在 TypeScript (Express) 與 Python (FastAPI) 中直接引入 `JITEngine`。
* 裝飾器與物件式端點宣告、雙引擎配置（TypeSafe 雲端引擎 vs Needle 本地離線引擎）。
* 觀測凍結機制與多語言合約代碼生成。

### 5. 📱 [Client 端調用指南 (前端與跨服務通訊)](./client_guide.md)
* **Phase 1（熱啟動期）**：前端 / Client 傳送自然語言或鬆散 JSON。
* **Phase 2（演進期）**：結構趨向穩定，觸發伺服器自動凍結。
* **Phase 3（極速期）**：Client 端如何使用自動產出的 TypeScript 型態或 Protobuf 達成 0ms AI 延遲。
* **Schema Drift（演化期）**：Client 業務變更傳送新規格時的無痛過渡。

### 6. 💻 [可直接執行的程式碼範例 (`docs/examples/`)](./examples/)
* [docs/examples/ts_server.ts](./examples/ts_server.ts) — 整合 Web Dashboard、k6 壓測與 MD 規格的 Express 伺服器
* [docs/examples/ts_client.ts](./examples/ts_client.ts) — TypeScript 全生命週期客戶端測試腳本
* [docs/examples/py_server.py](./examples/py_server.py) — Python FastAPI + JITEngine 伺服器
* [docs/examples/py_client.py](./examples/py_client.py) — Python 客戶端調用示範腳本

### 7. 🔄 [版本發布與升級指南](./release_and_upgrade_guide.md)
* **GitHub vs 官方 Registry（廚房 vs 超市貨架）**：清晰區分代碼存放與終端安裝包。
* **套件發布 SOP**：NPM (`jit-api`) 與 PyPI (`jit-protocol`) 版號遞增與發布流程。
* **業務 API 規格快照發布與秒級降版**：`npx jit-api release <ver>` 建立規格快照；`npx jit-api rollback <ver>` 零停機即時回滾。
* **使用者升級方法**：`npx jit-api` 自動無痛升級、`npm update -g`、`pip install -U` 與 Docker 映像檔更新。

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
