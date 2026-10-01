---
name: jit-data-analytics
description: >-
  Runbook for AI Agents (Cursor, Windsurf, Claude Code, Antigravity) to perform Chat-First
  data science, instant DuckDB analytics, interactive ECharts visualization, and Streamlit
  dashboard generation within JIT-API.
---

# JIT-API Data Science & Streamlit Synthesis - Agent Guide

本手冊指導 AI Agent（如 Cursor, Windsurf, Claude Code, Antigravity）如何依據人類使用者的自然語言要求，在免手動配置資料庫連線、免手刻前端的情況下，自動調用 Python 模組進行**毫秒級數據分析、生成自包含互動圖表、合成 Streamlit 儀表板，並結晶為永久 API**。

---

## 1. 核心哲學：人機對話優先 (Chat-First)

人類使用者（資料科學家、業務主管或 PM）不需要記憶 API 格式或資料庫帳密。他們只會用口語說出意圖，例如：
* *「幫我分析過去三個月不同渠道的訂單金額與回購趨勢」*
* *「做一個可以拉動滑桿篩選地區的 Streamlit 儀表板」*
* *「把這個銷售圓餅圖打包成單一 HTML 報告分享給團隊」*

作為 AI Agent，你的任務是：
1. **探索結構**：透過 DBX MCP 或本地 DuckDB 反射真實欄位，絕不臆測不存在的表或欄位。
2. **高速計算**：調用 `jit_api.analytics.Dataset` 與 DuckDB 進行向量化統計（精準運算，避免大模型算術幻覺）。
3. **視覺呈現**：若使用者需要獨立報告，調用 `jit_api.visual.Chart` 生成自包含 HTML；若需要互動應用，生成 Streamlit 代碼。
4. **一鍵結晶**：將滿意的查詢結晶至 `specs/*.api.md`，未來 0ms 靜態響應。

---

## 2. 常用 Python 模組速查庫

### 2.1 數據探索與聚合 (`jit_api.analytics.Dataset`)
```python
from jit_api.analytics import Dataset
from jit_api.data import LocalDuckDBAdapter

# 1. 本地 DuckDB 查詢
duck = LocalDuckDBAdapter()
await duck.connect()
ds = await Dataset.from_duckdb(
    "SELECT category, SUM(price) as total_revenue, COUNT(id) as orders FROM orders GROUP BY category",
    adapter=duck
)

# 2. 自動數據健康度統計
stats = ds.describe()

# 3. 快速聚合
agg = ds.aggregate(dimensions=["category"], metrics={"total_revenue": "sum"})
```

### 2.2 零設定互動圖表 (`jit_api.visual.Chart`)
```python
from jit_api.visual import Chart

# 生成柱狀圖 (Bar)
bar_chart = Chart.bar(ds, x="category", y="total_revenue", title="各品類營收佔比")

# 生成折線圖 (Line)
line_chart = Chart.line(ds, x="date", y="orders", title="每日訂單走勢")

# 生成圓餅圖 (Pie)
pie_chart = Chart.pie(ds, names="category", values="total_revenue", title="品類市場佔有率")

# 存成單一自包含 HTML 檔案 (可直接用瀏覽器打開互動、縮放)
bar_chart.save_html("reports/revenue_bar.html")
```

### 2.3 簡易 UI：Streamlit 儀表板合成 (`jit_api.ui`)
當使用者要求「互動介面」或提到「Streamlit」時：
```python
from jit_api.ui import scaffold_streamlit_app

# 一行指令自動產生完整的 Streamlit 應用程式代碼
scaffold_streamlit_app(
    filepath="dashboard.py",
    title="即時營運指標看板",
    default_sql="SELECT category, SUM(price) as total_revenue, COUNT(id) as total_orders FROM orders GROUP BY category"
)
```
產出後，提示使用者執行：
```bash
streamlit run dashboard.py
```

### 2.4 多圖表打包與分享 (`jit_api.share.Publisher`)
```python
from jit_api.share import Publisher

pub = Publisher()

# 打包多張圖表成現代深色玻璃擬態 (Glassmorphic) 儀表板
pub.export_dashboard(
    charts=[bar_chart, line_chart, pie_chart],
    title="2026 Q3 營運報告",
    output_path="reports/q3_executive_summary.html",
    metrics={"全站總營收": "$1,450,200", "總訂單數": "28,450", "平均客單價": "$51.0"}
)

# 結晶為永久 0ms JIT-API 規格
pub.crystallize_as_spec(
    route="get_q3_summary",
    sql="SELECT category, SUM(price) as total FROM orders GROUP BY 1"
)
```

---

## 3. Agent 任務執行標準作業程序 (SOP)

當人類對你發出分析需求時，嚴格遵循以下步驟：
1. **確認數據來源**：
   - 若為專案本地數據，使用 `LocalDuckDBAdapter`。
   - 若為遠端資料庫，透過 DBX MCP 調用 `DBXMCPAdapter`。
2. **運算與驗證**：
   - 撰寫 SQL 進行計算，檢查輸出筆數是否符合邏輯。
3. **選擇最適交付物**：
   - **若是臨時查看**：終端直接輸出重點 KPI 與數據表格。
   - **若是需要分享**：生成 `reports/*.html` 單檔互動圖表。
   - **若是需要深入動態篩選**：生成 `streamlit_app.py` 並附上啟動指令。
