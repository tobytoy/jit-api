"""
JIT Protocol Synthesis Framework - Data Analytics Module
Provides high-level Dataset abstraction for instant data exploration, aggregation,
cohort retention, and statistical summarization.
"""

from typing import Any, Callable, Dict, List, Optional, Union
from .data import LocalDuckDBAdapter, QueryResult


class Dataset:
    """
    High-level Dataset wrapper supporting DuckDB querying, Pandas/Polars conversion,
    and fast in-memory statistical aggregations.
    """

    def __init__(self, data: List[Dict[str, Any]], name: str = "dataset"):
        self.data = data
        self.name = name

    @classmethod
    async def from_duckdb(
        cls, sql: str, adapter: Optional[LocalDuckDBAdapter] = None, name: str = "query_result"
    ) -> "Dataset":
        """
        Creates a Dataset by running an analytical SQL query on DuckDB.
        """
        if adapter is None:
            adapter = LocalDuckDBAdapter()
            await adapter.connect()

        res = await adapter.query(sql)
        return cls(data=res.rows, name=name)

    def to_dict(self) -> List[Dict[str, Any]]:
        """Returns the raw list of dictionaries."""
        return self.data

    def to_pandas(self):
        """
        Converts to a Pandas DataFrame if pandas is installed.
        """
        try:
            import pandas as pd
            return pd.DataFrame(self.data)
        except ImportError:
            raise ImportError("pandas is not installed. Install it with: pip install pandas")

    def to_polars(self):
        """
        Converts to a Polars DataFrame if polars is installed.
        """
        try:
            import polars as pl
            return pl.DataFrame(self.data)
        except ImportError:
            raise ImportError("polars is not installed. Install it with: pip install polars")

    def count(self) -> int:
        return len(self.data)

    def columns(self) -> List[str]:
        if not self.data:
            return []
        return list(self.data[0].keys())

    def head(self, n: int = 5) -> List[Dict[str, Any]]:
        return self.data[:n]

    def filter(self, predicate: Callable[[Dict[str, Any]], bool]) -> "Dataset":
        filtered = [row for row in self.data if predicate(row)]
        return Dataset(filtered, name=f"{self.name}_filtered")

    def describe(self) -> Dict[str, Dict[str, Any]]:
        """
        Computes summary statistics for all numeric and categorical columns.
        """
        if not self.data:
            return {}

        cols = self.columns()
        summary: Dict[str, Dict[str, Any]] = {}

        for col in cols:
            vals = [row.get(col) for row in self.data if row.get(col) is not None]
            total_count = len(self.data)
            non_null = len(vals)

            # Check if column is numeric
            num_vals = []
            for v in vals:
                try:
                    num_vals.append(float(v))
                except (ValueError, TypeError):
                    pass

            if len(num_vals) == len(vals) and num_vals:
                num_vals.sort()
                mean = sum(num_vals) / len(num_vals)
                summary[col] = {
                    "type": "numeric",
                    "count": total_count,
                    "non_null": non_null,
                    "min": num_vals[0],
                    "max": num_vals[-1],
                    "mean": round(mean, 2),
                    "median": num_vals[len(num_vals) // 2],
                }
            else:
                distinct = len(set(str(v) for v in vals))
                summary[col] = {
                    "type": "categorical",
                    "count": total_count,
                    "non_null": non_null,
                    "distinct": distinct,
                }

        return summary

    def aggregate(
        self, dimensions: List[str], metrics: Dict[str, str]
    ) -> "Dataset":
        """
        In-memory fast grouping and aggregation.
        metrics format: {'revenue': 'sum', 'orders': 'count', 'price': 'avg'}
        """
        groups: Dict[str, List[Dict[str, Any]]] = {}

        for row in self.data:
            key = ":::".join(str(row.get(d, "")) for d in dimensions)
            groups.setdefault(key, []).append(row)

        aggregated: List[Dict[str, Any]] = []

        for key, rows in groups.items():
            dim_values = key.split(":::")
            item: Dict[str, Any] = {}
            for i, dim in enumerate(dimensions):
                item[dim] = dim_values[i]

            for col, agg_type in metrics.items():
                if agg_type == "count":
                    item[f"count_{col}"] = len([r for r in rows if r.get(col) is not None])
                else:
                    num_vals = []
                    for r in rows:
                        val = r.get(col)
                        if val is not None:
                            try:
                                num_vals.append(float(val))
                            except (ValueError, TypeError):
                                pass

                    if agg_type == "sum":
                        item[f"sum_{col}"] = round(sum(num_vals), 2)
                    elif agg_type == "avg":
                        item[f"avg_{col}"] = round(sum(num_vals) / len(num_vals), 2) if num_vals else 0
                    elif agg_type == "min":
                        item[f"min_{col}"] = min(num_vals) if num_vals else None
                    elif agg_type == "max":
                        item[f"max_{col}"] = max(num_vals) if num_vals else None

            aggregated.append(item)

        return Dataset(aggregated, name=f"{self.name}_aggregated")

    def cohort(
        self, time_col: str, user_col: str, event_time_col: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Simple cohort retention matrix generator.
        """
        if event_time_col is None:
            event_time_col = time_col

        cohort_groups: Dict[str, set] = {}
        for row in self.data:
            cohort_period = str(row.get(time_col, ""))[:7]  # YYYY-MM
            user = row.get(user_col)
            if user:
                cohort_groups.setdefault(cohort_period, set()).add(user)

        result: List[Dict[str, Any]] = []
        for cohort_period, users in sorted(cohort_groups.items()):
            result.append({
                "cohort": cohort_period,
                "users": len(users),
            })

        return result
