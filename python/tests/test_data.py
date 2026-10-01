import unittest
import asyncio
from jit_api.data import DataEngine, LocalDuckDBAdapter, DBXMCPAdapter


class TestPythonData(unittest.IsolatedAsyncioTestCase):
    async def test_python_duckdb_adapter(self):
        duck = LocalDuckDBAdapter(database_path=":memory:", name="analytics")
        duck.insert_rows(
            "sales",
            [
                {"item": "laptop", "amount": 1200, "dept": "IT"},
                {"item": "mouse", "amount": 50, "dept": "IT"},
                {"item": "chair", "amount": 300, "dept": "HR"},
            ],
        )

        # Aggregation query
        res = await duck.query("SELECT dept, SUM(amount) AS total FROM sales GROUP BY dept")
        self.assertEqual(res.row_count, 2)

        it_dept = next((r for r in res.rows if r["dept"] == "IT"), None)
        self.assertIsNotNone(it_dept)
        val = float(it_dept.get("total", it_dept.get("sum_amount", 0)))
        self.assertEqual(val, 1250.0)

    async def test_python_data_engine(self):
        engine = DataEngine()
        duck = LocalDuckDBAdapter()
        engine.register_adapter(duck, is_default=True)

        dbx = DBXMCPAdapter(name="dbx_prod")
        engine.register_adapter(dbx)

        self.assertIs(engine.get_adapter("dbx_prod"), dbx)
        self.assertIs(engine.get_adapter(), duck)

        duck.insert_rows("logs", [{"level": "info"}, {"level": "error"}])
        count_res = await engine.query("SELECT COUNT(*) FROM logs")
        self.assertEqual(count_res.rows[0]["count"], 2)


if __name__ == "__main__":
    unittest.main()
