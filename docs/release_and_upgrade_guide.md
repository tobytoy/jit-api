# JIT-API 版本迭代發布與升級指南 (Release & Upgrade Guide)

本指南旨在幫助**維護者（開發者）**理解如何將新版本發布至 NPM 與 PyPI，並幫助**終端使用者**掌握如何在各自的環境中進行無痛升級。

---

## 🧭 核心概念：GitHub vs 官方 Registry（廚房 vs 超市貨架）

在開源生態中，代碼託管與套件分發是完全獨立的兩個體系：

```text
┌────────────────────────────────────────────────────────┐
│ 1. GitHub 程式碼倉庫 (工廠 / 廚房)                      │
│    - 儲存所有原始碼、歷史 commit 與 PR 協作              │
│    - 在 GitHub 上修改代碼，【不會】直接影響到終端使用者的安裝包 │
└──────────────────────────┬─────────────────────────────┘
                           │ 經過本地測試、編譯與打包 (Release)
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. 官方 Registry (超市貨架)                             │
│    - NPM Registry: https://www.npmjs.com/package/jit-api │
│    - PyPI Registry: https://pypi.org/project/jit-protocol│
│    - 只有發布到此處，終端使用者才能透過指令取得升級！       │
└──────────────────────────┬─────────────────────────────┘
                           │ 使用者拉取更新 (Upgrade)
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. 終端使用者環境 (Client Environments)                 │
│    - npx jit-api (自動獲取最新版)                       │
│    - npm update -g jit-api                             │
│    - pip install -U jit-protocol                       │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ 第一部分：維護者（發布新版本 SOP）

### 1. 遵循語意化版本號（SemVer 規範）
版本號格式為 `MAJOR.MINOR.PATCH`（例如 `1.0.0`）：
* **PATCH (修訂號, 如 1.0.0 ➔ 1.0.1)**：修復 Bug、修補小問題，完全向下相容。
* **MINOR (次版號, 如 1.0.1 ➔ 1.1.0)**：新增功能，但維持現有 API 向下相容。
* **MAJOR (主版號, 如 1.1.0 ➔ 2.0.0)**：重大架構調整、破壞性變更（Breaking Change）。

> ⚠️ **PyPI 與 NPM 鐵律**：  
> 已發布過的版本號**絕對不可重複覆蓋**。每次發布新代碼前，**必須先提升版本號**！

---

### 2. NPM (Node.js) 版本升級與發布步驟

#### 步驟 1：修改版本號
在 `package.json` 中將 `"version"` 向上調整（例如從 `"1.0.0"` 改為 `"1.0.1"`），或在終端機執行：
```bash
npm version patch   # 自動遞增修訂號 (1.0.0 -> 1.0.1)
# 或 npm version minor (1.0.0 -> 1.1.0)
```

#### 步驟 2：測試與編譯代碼
```bash
npm test            # 確保所有單元測試 100% 通過
npm run build       # 重新編譯 TypeScript 至 dist/
```

#### 步驟 3：發布前模擬檢查 (Dry-Run)
```bash
npm pack --dry-run
```
* 檢查輸出的檔案清單，確保發布包保持在 ~123KB 的輕量體積，且沒有打包進大型系統二進制檔案（如 `bin/k6`）。

#### 步驟 4：正式發布
```bash
npm publish --access public
```
* 若跳出瀏覽器授權提示，按 Enter 在瀏覽器點擊 **Approve** 即可秒級發布。

---

### 3. PyPI (Python) 版本升級與發布步驟

#### 步驟 1：修改版本號
在 `python/pyproject.toml` 中修改版本號：
```toml
[project]
name = "jit-protocol"
version = "1.0.1"   # 更新為新版號
```

#### 步驟 2：清理舊快取並重新打包
```bash
# 1. 啟用 Conda 環境（或任何 Python >= 3.10 環境）
conda activate toby

# 2. 清理舊構建檔
rm -rf python/dist python/build python/*.egg-info

# 3. 重新構建 Wheel 與 源碼包
python -m build python/

# 4. 檢查包元數據
twine check python/dist/*
```

#### 步驟 3：正式上傳發布
使用您的 PyPI API Token（或專屬 Project Token）：
```bash
twine upload python/dist/* \
  -u __token__ \
  -p 'pypi-你的API-Token'
```

---

### 🤖 4. AI Agent 輔助發布（一句話搞定）

由於本機已配置全域 `publish-packages` Skill，維護者只需對 AI 說一句：
> 🗣️ **「我剛剛修復了某某問題，請幫我將版本升級到 1.0.1 並發布到 npm 與 pypi！」**

AI 就會自動執行版本修改、build 編譯、twine 上傳與 npm publish 全套流程！

---

## 👥 第二部分：終端使用者（如何升級使用新版）

使用者根據其採用方式，升級路徑如下：

### 1. 使用 `npx` 的用戶（最無痛，自動升級）
`npx` 會自動快取並在執行時向 NPM 檢查 `@latest`。
```bash
npx jit-api
```
* **強制即時拉取最新版**：
  ```bash
  npx jit-api@latest
  ```
  使用者無需任何手動解除安裝，下次啟動時立即享有新版功能！

### 2. 全域安裝 CLI 的用戶 (`npm i -g`)
使用者只需在終端機執行：
```bash
npm update -g jit-api
# 或重新安裝最新版
npm install -g jit-api@latest
```

### 3. Python 用戶 (`pip`)
Python 開發者在終端機執行升級指令：
```bash
pip install --upgrade jit-protocol
# 簡寫方式：
pip install -U jit-protocol
```
pip 會自動比對本地與 PyPI 上的版本號，自動替換為最新版。

### 4. Docker 用戶
若使用 Docker 容器運行：
```bash
# 若使用 Docker Compose 本地構建：
docker compose build --no-cache
docker compose up -d

# 若未來推送至 Docker Hub：
docker compose pull
docker compose up -d
```

---

## 🎯 第三部分：業務 API 規格發布與快速降版 (Spec Release & Rollback)

除了 `jit-api` 工具本體發布至 NPM/PyPI 之外，開發團隊在日常業務中維護的 **Markdown API 規格 (`specs/*.api.md`)** 也享有完善的版本封存與事故秒級降版機制：

### 1. 規格發布至生產 (Release to Prod)
當 API 在 `dev` 模式（Port 3005）測試驗證無誤，將規格標記為 `Stage: prod` 後，執行：
```bash
npx jit-api release 1.0.0 "會員登入與結帳端點上線"
```
* **系統行為**：
  * 自動在專案目錄建立 `.jit/releases/v1.0.0/` 快照備份。
  * 產出包含時間戳記、API 清單與說明之 `manifest.json`。
  * 生產伺服器 (`npx jit-api start`, Port 3000) 即可對外正式提供服務。

### 2. 生產事故秒級無縫降版 (Instant Rollback)
若最新發布的 API 在線上遇到非預期業務例外，需緊急恢復上一版穩定狀態：
```bash
npx jit-api rollback 1.0.0
```
* **零停機熱還原 (Zero-Downtime)**：
  * 1 秒內自快照還原對應版本之規格檔案。
  * `MDLoader` 無縫熱加載至記憶體中，**Node.js 服務無須重啟，正在進行的 HTTP 請求不會中斷**。

