# JIT Protocol Synthesis (JIT-API) 使用者指南與範例

歡迎閱讀 **JIT 協定合成框架（Just-In-Time Protocol Synthesis）** 完整開發指南。  
本文件夾提供完整的 **Server 端架構** 與 **Client 端調用方式**，協助您在實際產品中運用「動態語意協商 ➔ 靜態程式碼凍結 ➔ 自我演進降級」的雙軌 API 開發範式。

---

## 📚 目錄架構

1. **[Server 端整合指南 (server_guide.md)](./server_guide.md)**
   * 如何在 TypeScript (Express) 與 Python (FastAPI) 中架設 JIT 伺服器
   * 端點自然語言宣告與業務 Handler 註冊
   * 雙引擎配置（TypeSafe 雲端引擎 vs Needle 本地離線引擎）
   * 觀測凍結機制與多語言合約代碼生成
   * Schema Drift 自動回退與版本升級處理

2. **[Client 端調用指南 (client_guide.md)](./client_guide.md)**
   * **Phase 1（熱啟動期）**：前端 / Client 傳送自然語言或鬆散 JSON
   * **Phase 2（演進期）**：結構趨向穩定，觸發伺服器自動凍結
   * **Phase 3（極速期）**：Client 端如何使用自動產出的 TypeScript 型態或 Protobuf 達成 0ms AI 延遲
   * **Schema Drift（演化期）**：Client 業務變更傳送新規格時的無痛過渡

3. **可直接執行的程式碼範例 (`docs/examples/`)**
   * **TypeScript 範例**：
     * [docs/examples/ts_server.ts](./examples/ts_server.ts) — Express + JITEngine 完整伺服器
     * [docs/examples/ts_client.ts](./examples/ts_client.ts) — 包含 Phase 1 ➔ 2 ➔ 3 ➔ Drift 的客戶端測試腳本
   * **Python 範例**：
     * [docs/examples/py_server.py](./examples/py_server.py) — FastAPI + JITEngine 完整伺服器
     * [docs/examples/py_client.py](./examples/py_client.py) — Python 客戶端調用示範腳本

---

## ⚡ 核心生命週期在 Server / Client 間的互動圖

```text
========================================================================================
[Phase 1: 語意熱啟動期 (Dynamic)]
Client: 發送任意非結構化 JSON（如帶 message、非正規 key）
Server: TypeSafe Jev 或本地 Needle 進行意圖路由與欄位正規化，執行 Handler
----------------------------------------------------------------------------------------
                                      ⬇
[Phase 2: 流量觀測與自動凍結 (Observation & Freeze)]
Client: 連續發送格式一致的資料
Server: SchemaObserver 統計穩定度 100% 且信心度達標 ➔ 觸發 Freeze
        自動編譯產出 TypeScript (Zod)、Go (.proto)、Python (Pydantic) 檔案至 generated/
----------------------------------------------------------------------------------------
                                      ⬇
[Phase 3: 傳統極速期 (Static Fast-Path)]
Client: 發送符合規格的 JSON（可直接 import 產出的型態）
Server: 本地靜態驗證器 (Zod / Pydantic) 瞬間通過 ➔ 0 毫秒 AI 延遲、0 API 費用極速響應！
----------------------------------------------------------------------------------------
                                      ⬇
[Schema Drift: 業務變更自主演進 (Fallback & Self-Evolution)]
Client: 業務邏輯更新，傳入新型態或新增欄位（靜態驗證失敗）
Server: 自動降級回 Phase 1 處理請求 ➔ 開啟 v2 觀測 ➔ 服務零中斷，合約自動更新！
========================================================================================
```
