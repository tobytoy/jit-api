# Grafana k6 壓力測試指南 (Grafana k6 Benchmark Guide)

本指南說明如何使用整合的 **Grafana k6 (v0.54.0)** 引擎對 JIT API 進行高並發壓力測試，驗證從 **Phase 1（動態語意/端側 AI）** 演進至 **Phase 3（靜態 Fast-Path 本地極速）** 所帶來的效能飛躍。

---

## 1. 壓測目標與核心指標

JIT 協定合成的核心價值在於**「開發期享受 AI 彈性，上線期享受二進制/本機極限效能」**：

| 評測情境 | 傳輸特徵 | 後端處理路徑 | 預期 QPS / RPS | 預期延遲 | AI 運算耗時 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1 (語意模式)** | 鬆散 JSON / 自然語言 | Needle (端側) 或 TypeSafe (雲端) 語意路由 | ~20 - 80 RPS | 30ms ~ 800ms | 20ms ~ 750ms |
| **Phase 3 (Fast-Path)** | 規範 JSON | 本機編譯之 Zod / Pydantic 靜態驗證 | **1,000 - 3,500+ RPS** | **&lt; 1 ms** | **0.0 ms (完全歸零)** |

> **實測結果亮點**：
> Phase 3 Fast-Path 帶來 **50x ~ 100x 的吞吐量躍升**，且伺服器 CPU 負載極低，因為所有請求均不再經過任何 AI 模型推論！

---

## 2. 方式 A：Web 視覺化控制台一鍵壓測 (推薦)

不需要安裝任何 CLI 工具，打開前端儀表板即可一鍵執行：

1. 啟動伺服器：
   ```bash
   ./run.sh
   ```
2. 瀏覽器開啟：`http://localhost:3005`
3. 切換至 **「⚡ Grafana k6 壓力測試」** 分頁：
   - **選擇測試目標**：
     - `Phase 3: 傳統極速期 (Fast-Path)`：測試凍結後的微秒級極限性能。
     - `Phase 1: 語意熱啟動期 (Dynamic)`：測試動態推論承載力。
   - **調整虛擬用戶 (VUs)**：預設 15 VUs（可拉動滑桿至 5 ~ 50 VUs）。
   - **調整測試秒數**：預設 5 秒（可調整至 3 ~ 15 秒）。
   - 點擊紫色按鈕 **「⚡ 開始執行一鍵壓力測試」**。
4. **即時視覺化成果**：
   - **RPS 儀表盤**：即時計算出的每秒請求數。
   - **延遲階梯分佈**：Min、Median (p50)、p90、p95、p99、Max 階梯式呈現。
   - **折疊式原生日誌**：點擊可展開檢視 Grafana k6 的原生終端 ASCII 統計輸出。

---

## 3. 方式 B：CLI 命令列壓測 (適合 CI/CD 與自動化整合)

專案根目錄內建免安裝的 64 位元綠色版 `bin/k6`，可直接在終端機調用：

### 執行預設 Phase 3 壓測 (10 VUs, 5秒)
```bash
./bin/k6 run benchmark/k6_stress_test.js
```

### 自訂並發、秒數與目標模式
```bash
# 測試 Phase 3 極速模式：20 VUs、持續 10 秒
K6_MODE=phase3 K6_VUS=20 K6_DURATION=10s ./bin/k6 run benchmark/k6_stress_test.js

# 測試 Phase 1 動態模式：5 VUs、持續 5 秒
K6_MODE=phase1 K6_VUS=5 K6_DURATION=5s ./bin/k6 run benchmark/k6_stress_test.js
```

### 匯出 JSON 統計報告
```bash
./bin/k6 run --summary-export=report.json benchmark/k6_stress_test.js
```

---

## 4. 壓測腳本客製化 (`benchmark/k6_stress_test.js`)

壓測腳本支援自定義自訂指標與閥值：
- `reqDuration`: 追蹤自訂請求延遲分佈。
- `successRate`: 統計 HTTP 200 與資料正確性的成功率。
- `thresholds`: 當失敗率高於 5% 時，k6 會自動回傳非零退出碼（適合 GitHub Actions 斷言）。
