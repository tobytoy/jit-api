"""
JIT Protocol Synthesis Framework - Interactive Visualizations
Generates self-contained, responsive, and beautiful interactive HTML charts
powered by modern Apache ECharts. Zero backend server required.
"""

import json
from typing import Any, Dict, List, Optional
from .analytics import Dataset


class Chart:
    """
    Interactive Chart builder creating standalone, self-contained HTML reports.
    """

    def __init__(
        self,
        chart_type: str,
        title: str,
        options: Dict[str, Any],
        theme: str = "dark",
    ):
        self.chart_type = chart_type
        self.title = title
        self.options = options
        self.theme = theme

    @classmethod
    def bar(
        cls,
        dataset: Dataset,
        x: str,
        y: str,
        group: Optional[str] = None,
        title: str = "Bar Chart",
        theme: str = "dark",
    ) -> "Chart":
        data = dataset.to_dict()
        categories = sorted(list(set(str(r.get(x, "")) for r in data)))

        if group:
            groups = sorted(list(set(str(r.get(group, "")) for r in data)))
            series = []
            for g in groups:
                series_data = []
                for cat in categories:
                    val = next((r.get(y, 0) for r in data if str(r.get(x, "")) == cat and str(r.get(group, "")) == g), 0)
                    series_data.append(val)
                series.append({
                    "name": g,
                    "type": "bar",
                    "data": series_data,
                })
        else:
            series_data = []
            for cat in categories:
                val = next((r.get(y, 0) for r in data if str(r.get(x, "")) == cat), 0)
                series_data.append(val)
            series = [{
                "name": y,
                "type": "bar",
                "data": series_data,
                "itemStyle": {"borderRadius": [4, 4, 0, 0]},
            }]

        options = {
            "title": {"text": title, "left": "center", "textStyle": {"color": "#e2e8f0"}},
            "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
            "legend": {"bottom": 10, "textStyle": {"color": "#94a3b8"}},
            "xAxis": {"type": "category", "data": categories, "axisLabel": {"color": "#94a3b8"}},
            "yAxis": {"type": "value", "axisLabel": {"color": "#94a3b8"}, "splitLine": {"lineStyle": {"color": "#334155"}}},
            "series": series,
        }
        return cls("bar", title, options, theme)

    @classmethod
    def line(
        cls,
        dataset: Dataset,
        x: str,
        y: str,
        group: Optional[str] = None,
        title: str = "Line Chart",
        theme: str = "dark",
        smooth: bool = True,
    ) -> "Chart":
        data = dataset.to_dict()
        categories = sorted(list(set(str(r.get(x, "")) for r in data)))

        if group:
            groups = sorted(list(set(str(r.get(group, "")) for r in data)))
            series = []
            for g in groups:
                series_data = []
                for cat in categories:
                    val = next((r.get(y, 0) for r in data if str(r.get(x, "")) == cat and str(r.get(group, "")) == g), 0)
                    series_data.append(val)
                series.append({
                    "name": g,
                    "type": "line",
                    "smooth": smooth,
                    "data": series_data,
                })
        else:
            series_data = []
            for cat in categories:
                val = next((r.get(y, 0) for r in data if str(r.get(x, "")) == cat), 0)
                series_data.append(val)
            series = [{
                "name": y,
                "type": "line",
                "smooth": smooth,
                "data": series_data,
                "areaStyle": {"opacity": 0.2},
            }]

        options = {
            "title": {"text": title, "left": "center", "textStyle": {"color": "#e2e8f0"}},
            "tooltip": {"trigger": "axis"},
            "legend": {"bottom": 10, "textStyle": {"color": "#94a3b8"}},
            "xAxis": {"type": "category", "data": categories, "axisLabel": {"color": "#94a3b8"}},
            "yAxis": {"type": "value", "axisLabel": {"color": "#94a3b8"}, "splitLine": {"lineStyle": {"color": "#334155"}}},
            "series": series,
        }
        return cls("line", title, options, theme)

    @classmethod
    def pie(
        cls,
        dataset: Dataset,
        names: str,
        values: str,
        title: str = "Pie Chart",
        theme: str = "dark",
    ) -> "Chart":
        data = dataset.to_dict()
        pie_data = [{"name": str(r.get(names, "")), "value": r.get(values, 0)} for r in data]

        options = {
            "title": {"text": title, "left": "center", "textStyle": {"color": "#e2e8f0"}},
            "tooltip": {"trigger": "item", "formatter": "{b}: {c} ({d}%)"},
            "legend": {"orient": "vertical", "left": "left", "textStyle": {"color": "#94a3b8"}},
            "series": [{
                "type": "pie",
                "radius": ["40%", "70%"],
                "avoidLabelOverlap": False,
                "itemStyle": {"borderRadius": 8, "borderColor": "#0f172a", "borderWidth": 2},
                "label": {"show": False, "position": "center"},
                "emphasis": {"label": {"show": True, "fontSize": 18, "fontWeight": "bold", "color": "#f8fafc"}},
                "data": pie_data,
            }],
        }
        return cls("pie", title, options, theme)

    def to_dict(self) -> Dict[str, Any]:
        return self.options

    def to_html(self, height: str = "500px") -> str:
        """
        Renders a self-contained interactive HTML page.
        """
        options_json = json.dumps(self.options, ensure_ascii=False)
        chart_id = f"chart_{abs(hash(self.title)) % 100000}"

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{self.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <style>
    body {{
      margin: 0;
      padding: 24px;
      background-color: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }}
    .card {{
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      max-width: 1000px;
      margin: 0 auto;
    }}
    .chart-container {{
      width: 100%;
      height: {height};
    }}
  </style>
</head>
<body>
  <div class="card">
    <div id="{chart_id}" class="chart-container"></div>
  </div>
  <script>
    (function() {{
      const chartDom = document.getElementById('{chart_id}');
      const myChart = echarts.init(chartDom, 'dark', {{ backgroundColor: 'transparent' }});
      const option = {options_json};
      myChart.setOption(option);
      window.addEventListener('resize', function() {{
        myChart.resize();
      }});
    }})();
  </script>
</body>
</html>"""

    def save_html(self, filepath: str, height: str = "500px") -> str:
        """
        Saves the self-contained HTML chart to disk.
        """
        html = self.to_html(height=height)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        return filepath
