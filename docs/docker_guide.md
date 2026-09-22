# JIT Protocol Synthesis - Docker 一鍵運行指南

針對不想在本地電腦安裝 Node.js、Python、k6、Conda 等依賴的使用者與團隊，**JIT-API** 提供了完整的 Docker 容器化解決方案。

所有執行環境（Node 20、Python 3、Web 控制台、k6 壓測引擎、PTY 終端機與 MCP 服務）已完全封裝於容器中，**開箱即用，零配置，且絕對不會污染本地專案的 git 記錄**。

---

## 🚀 方式一：Docker Compose（最推薦，一鍵啟動）

專案根目錄已內建 `docker-compose.yml`。

### 1. 啟動服務
```bash
docker compose up -d
```

### 2. 檢視運行日誌
```bash
docker compose logs -f
```

### 3. 開啟網頁
瀏覽器直接造訪：[http://localhost:3005](http://localhost:3005)

### 4. 停止服務
```bash
docker compose down
```

---

## 🐳 方式二：Docker CLI 直接運行

### 1. 構建映像檔
```bash
docker build -t jit-api .
```

### 2. 掛載您自己的 `specs` 目錄並啟動
你可以將任意資料夾作為規格目錄掛載給容器使用，完全隔離：

```bash
docker run -d \
  --name jit-api-studio \
  -p 3005:3005 \
  -v $(pwd)/specs:/app/specs \
  jit-api
```

> **提示**：如果需要使用 TypeSafe 雲端引擎（預設為本地離線 Needle 引擎），只需加上 `-e TYPESAFE_API_KEY=your_key`：
> ```bash
> docker run -d \
>   --name jit-api-studio \
>   -p 3005:3005 \
>   -e TYPESAFE_API_KEY="your_key_here" \
>   -v $(pwd)/specs:/app/specs \
>   jit-api
> ```

---

## 🛠️ 在全新專案中配合 Docker 使用（獨立無污染）

若你在自己的專案（例如 `my-project`）中想使用 `jit-api`：

1. 在 `my-project` 中建立 `specs/` 資料夾：
   ```bash
   mkdir -p specs
   ```
2. 編寫 API 規格檔案，例如 `specs/payment.api.md`。
3. 執行 Docker 容器掛載：
   ```bash
   docker run -d \
     -p 3005:3005 \
     -v $(pwd)/specs:/app/specs \
     jit-api
   ```
4. 容器啟動後，只要在 `specs/` 內新增或修改 `.api.md` 檔案，JIT-API 伺服器會自動熱重載（Hot-Reload）並立即生效！

---

## 📦 容器包含的特色功能

| 功能 | 說明 | 容器內部位置 |
| :--- | :--- | :--- |
| **Web Studio 控制台** | 視覺化檢視規格、發送測試、即時圖表 | `http://localhost:3005` |
| **整合式 PTY 終端機** | 網頁底層提供真實 Bash 終端，即時下指令 | `http://localhost:3005` (抽屜面板) |
| **Grafana k6 壓測** | 一鍵壓測，實測 1,300+ RPS 極致效能 | `bin/k6` 內建 |
| **MCP 伺服器** | 支援 Claude / Cursor / Windsurf 的 MCP 協議 | `http://localhost:3005/sse` |
| **動態 API Gateway** | 意圖路由、欄位正規化與自動凍結機制 | `http://localhost:3005/api/jit` |
