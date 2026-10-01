"""
JIT Protocol Synthesis Framework - Sharing & Publishing Module
Packages multiple charts into unified executive HTML dashboards, formats alerts
for Slack/LINE/Discord, and crystallizes analytics into permanent 0ms JIT specifications.
"""

import json
from typing import Any, Dict, List, Optional
from .visual import Chart


class Publisher:
    """
    Multi-channel publisher for data reports, interactive dashboards, and permanent JIT API crystallization.
    """

    def export_dashboard(
        self,
        charts: List[Chart],
        title: str = "Executive Data Report",
        output_path: str = "reports/dashboard.html",
        metrics: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Exports multiple charts and KPI metrics into a single, beautiful standalone HTML dashboard.
        """
        metrics_html = ""
        if metrics:
            cards = []
            for label, val in metrics.items():
                cards.append(f"""
                <div class="metric-card">
                  <div class="metric-label">{label}</div>
                  <div class="metric-value">{val}</div>
                </div>
                """)
            metrics_html = f'<div class="metrics-grid">{"".join(cards)}</div>'

        chart_blocks = []
        chart_inits = []

        for idx, chart in enumerate(charts):
            chart_id = f"dashboard_chart_{idx}"
            opt_json = json.dumps(chart.options, ensure_ascii=False)
            chart_blocks.append(f"""
            <div class="chart-card">
              <div id="{chart_id}" class="chart-container"></div>
            </div>
            """)
            chart_inits.append(f"""
            (function() {{
              const dom = document.getElementById('{chart_id}');
              const chart = echarts.init(dom, 'dark', {{ backgroundColor: 'transparent' }});
              chart.setOption({opt_json});
              window.addEventListener('resize', () => chart.resize());
            }})();
            """)

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <style>
    :root {{
      --bg: #090d16;
      --card-bg: rgba(26, 34, 53, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --accent: #38bdf8;
      --text: #f8fafc;
      --muted: #94a3b8;
    }}
    body {{
      margin: 0;
      padding: 32px 24px;
      background: radial-gradient(circle at top, #1e293b 0%, var(--bg) 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
    }}
    .container {{
      max-width: 1200px;
      margin: 0 auto;
    }}
    header {{
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }}
    h1 {{
      margin: 0;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
    .badge {{
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }}
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }}
    .metric-card {{
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }}
    .metric-label {{
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .metric-value {{
      font-size: 26px;
      font-weight: 700;
      color: #fff;
    }}
    .charts-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 20px;
    }}
    .chart-card {{
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    }}
    .chart-container {{
      width: 100%;
      height: 420px;
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>{title}</h1>
      <span class="badge">⚡ JIT Standalone Report</span>
    </header>
    {metrics_html}
    <div class="charts-grid">
      {"".join(chart_blocks)}
    </div>
  </div>
  <script>
    {"".join(chart_inits)}
  </script>
</body>
</html>"""

        import os
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        return output_path

    def crystallize_as_spec(
        self,
        route: str,
        sql: str,
        store: str = "analytics",
        description: str = "Automated analytics pipeline synthesized by AI Agent",
        output_path: Optional[str] = None,
    ) -> str:
        """
        Crystallizes the query into a permanent Markdown specification in specs/*.api.md.
        """
        content = f"""# API: {route}
Version: 1.5.0
Stage: prod
> {description}

## Intent
Query analytics for {route}, metrics reporting, or dashboard sync

## Store: {store}
- Provider: local_duckdb

## Pipeline
- Aggregate: {sql}
"""
        target = output_path or f"specs/{route}.api.md"
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return target
