import unittest
import os
import shutil
from jit_api.analytics import Dataset
from jit_api.visual import Chart
from jit_api.share import Publisher
from jit_api.ui import generate_streamlit_app_code, scaffold_streamlit_app


class TestDataScienceModules(unittest.TestCase):
    def setUp(self):
        self.test_dir = "TMP/test_analytics_output"
        os.makedirs(self.test_dir, exist_ok=True)
        self.sample_data = [
            {"dept": "Engineering", "salary": 120000, "role": "Senior"},
            {"dept": "Engineering", "salary": 80000, "role": "Junior"},
            {"dept": "Marketing", "salary": 70000, "role": "Senior"},
            {"dept": "Marketing", "salary": 50000, "role": "Junior"},
        ]

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_dataset_aggregation_and_describe(self):
        ds = Dataset(self.sample_data, name="employees")
        self.assertEqual(ds.count(), 4)
        self.assertEqual(ds.columns(), ["dept", "salary", "role"])

        # Describe
        stats = ds.describe()
        self.assertIn("salary", stats)
        self.assertEqual(stats["salary"]["type"], "numeric")
        self.assertEqual(stats["salary"]["min"], 50000)
        self.assertEqual(stats["salary"]["max"], 120000)

        # Aggregate
        agg = ds.aggregate(dimensions=["dept"], metrics={"salary": "sum", "role": "count"})
        self.assertEqual(agg.count(), 2)

        eng = next(r for r in agg.to_dict() if r["dept"] == "Engineering")
        self.assertEqual(eng["sum_salary"], 200000)
        self.assertEqual(eng["count_role"], 2)

    def test_chart_generation(self):
        ds = Dataset(self.sample_data)
        chart = Chart.bar(ds, x="dept", y="salary", title="Salary by Dept")
        self.assertEqual(chart.chart_type, "bar")
        self.assertIn("series", chart.options)

        html = chart.to_html()
        self.assertIn("<title>Salary by Dept</title>", html)
        self.assertIn("echarts.min.js", html)

        # Save HTML
        out_file = os.path.join(self.test_dir, "test_chart.html")
        chart.save_html(out_file)
        self.assertTrue(os.path.exists(out_file))

    def test_publisher_dashboard_export(self):
        ds = Dataset(self.sample_data)
        bar_chart = Chart.bar(ds, x="dept", y="salary", title="Dept Salaries")
        line_chart = Chart.line(ds, x="dept", y="salary", title="Salary Trend")

        pub = Publisher()
        out_dashboard = os.path.join(self.test_dir, "dashboard.html")
        pub.export_dashboard(
            charts=[bar_chart, line_chart],
            title="HR Analytics Dashboard",
            output_path=out_dashboard,
            metrics={"Total Payroll": "$320,000", "Headcount": "4"},
        )

        self.assertTrue(os.path.exists(out_dashboard))
        with open(out_dashboard, "r", encoding="utf-8") as f:
            content = f.read()
            self.assertIn("HR Analytics Dashboard", content)
            self.assertIn("$320,000", content)

    def test_streamlit_scaffolding(self):
        code = generate_streamlit_app_code(title="Custom KPI App")
        self.assertIn("import streamlit as st", code)
        self.assertIn("Custom KPI App", code)

        scaffold_path = os.path.join(self.test_dir, "streamlit_app.py")
        scaffold_streamlit_app(filepath=scaffold_path, title="Custom KPI App")
        self.assertTrue(os.path.exists(scaffold_path))


if __name__ == "__main__":
    unittest.main()
