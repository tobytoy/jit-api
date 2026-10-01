"""
JIT Protocol Synthesis Framework - Streamlit UI Bridge
Provides zero-boilerplate Streamlit UI components, automated dashboard code generators,
and interactive exploration widgets.
"""

from typing import Any, Dict, List, Optional
from .analytics import Dataset
from .visual import Chart


def st_metrics_cards(metrics: Dict[str, Any]):
    """
    Renders clean KPI metric cards in Streamlit across dynamic columns.
    """
    try:
        import streamlit as st
    except ImportError:
        raise ImportError("streamlit is not installed. Install it with: pip install streamlit")

    cols = st.columns(len(metrics))
    for i, (label, val) in enumerate(metrics.items()):
        cols[i].metric(label=label, value=str(val))


def st_dataset_viewer(dataset: Dataset, title: str = "📊 Data Explorer"):
    """
    Renders an interactive DataFrame view in Streamlit with column filter.
    """
    try:
        import streamlit as st
    except ImportError:
        raise ImportError("streamlit is not installed. Install it with: pip install streamlit")

    st.subheader(title)
    df = dataset.to_dict()
    if not df:
        st.info("No data available.")
        return

    cols = dataset.columns()
    selected_cols = st.multiselect("Select Columns to Display", options=cols, default=cols)
    filtered_data = [{c: row.get(c) for c in selected_cols} for row in df]
    st.dataframe(filtered_data, use_container_width=True)


def st_chart(chart: Chart, height: int = 520):
    """
    Embeds an interactive JIT ECharts visual directly inside a Streamlit application.
    """
    try:
        import streamlit.components.v1 as components
    except ImportError:
        raise ImportError("streamlit is not installed. Install it with: pip install streamlit")

    html_content = chart.to_html(height=f"{height - 50}px")
    components.html(html_content, height=height)


def generate_streamlit_app_code(
    title: str = "JIT Analytics Dashboard",
    dataset_name: str = "sales_data",
    default_sql: str = "SELECT category, SUM(price) as total_revenue, COUNT(id) as total_orders FROM orders GROUP BY category",
) -> str:
    """
    Synthesizes a self-contained, interactive Streamlit application script.
    """
    return f'''"""
{title}
Automated Streamlit application synthesized by JIT-API & AI Agent.
"""

import streamlit as st
import asyncio
from jit_api.analytics import Dataset
from jit_api.visual import Chart
from jit_api.ui import st_metrics_cards, st_chart, st_dataset_viewer
from jit_api.data import LocalDuckDBAdapter

st.set_page_config(
    page_title="{title}",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.title("⚡ {title}")
st.caption("Powered by JIT-API Vector Engine (DuckDB) & Streamlit")

# Sidebar Filters
st.sidebar.header("🔍 Query & Analysis Controls")
sql_query = st.sidebar.text_area("SQL Pipeline", value="""{default_sql}""", height=120)

@st.cache_data(ttl=60)
def load_data(query: str):
    async def _fetch():
        duck = LocalDuckDBAdapter(database_path=":memory:")
        await duck.connect()
        # Seed demo data if table does not exist
        duck.insert_rows("orders", [
            {{"id": 1, "category": "Electronics", "price": 1200, "region": "North"}},
            {{"id": 2, "category": "Electronics", "price": 850, "region": "South"}},
            {{"id": 3, "category": "Home", "price": 320, "region": "North"}},
            {{"id": 4, "category": "Home", "price": 180, "region": "East"}},
            {{"id": 5, "category": "Books", "price": 65, "region": "West"}},
            {{"id": 6, "category": "Books", "price": 95, "region": "North"}},
            {{"id": 7, "category": "Electronics", "price": 2100, "region": "East"}},
        ])
        return await Dataset.from_duckdb(query, adapter=duck)
    return asyncio.run(_fetch())

try:
    ds = load_data(sql_query)
    data = ds.to_dict()

    if data:
        # 1. Top Metrics Summary
        total_rows = len(data)
        metrics = {{"Total Records": total_rows}}
        if "total_revenue" in data[0]:
            total_rev = sum(float(r.get("total_revenue", 0)) for r in data)
            metrics["Aggregated Revenue"] = f"${{total_rev:,.2f}}"
        if "total_orders" in data[0]:
            total_ord = sum(int(r.get("total_orders", 0)) for r in data)
            metrics["Total Volume"] = f"{{total_ord:,}}"
        st_metrics_cards(metrics)

        st.divider()

        # 2. Dynamic Visualizations
        col1, col2 = st.columns([3, 2])

        with col1:
            st.subheader("📈 Category Distribution")
            chart_type = st.radio("Chart Type", ["Bar", "Line", "Pie"], horizontal=True)
            if chart_type == "Bar":
                chart = Chart.bar(ds, x="category", y="total_revenue" if "total_revenue" in data[0] else list(data[0].keys())[1], title="Revenue by Category")
            elif chart_type == "Line":
                chart = Chart.line(ds, x="category", y="total_revenue" if "total_revenue" in data[0] else list(data[0].keys())[1], title="Trend by Category")
            else:
                chart = Chart.pie(ds, names="category", values="total_revenue" if "total_revenue" in data[0] else list(data[0].keys())[1], title="Category Share")
            st_chart(chart, height=450)

        with col2:
            st_dataset_viewer(ds, title="📋 Data Table")

    else:
        st.warning("Query returned zero results.")

except Exception as err:
    st.error(f"Error executing analysis: {{err}}")
'''


def scaffold_streamlit_app(
    filepath: str = "streamlit_app.py",
    title: str = "JIT Analytics Dashboard",
    default_sql: str = "SELECT category, SUM(price) as total_revenue, COUNT(id) as total_orders FROM orders GROUP BY category",
) -> str:
    """
    Scaffolds an executable Streamlit application script file.
    """
    code = generate_streamlit_app_code(title=title, default_sql=default_sql)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(code)
    return filepath
