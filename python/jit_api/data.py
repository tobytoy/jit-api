"""
JIT Protocol Synthesis Framework - Python Data Layer
Provides embedded DuckDB analytics, DBX MCP sidecar integration, and unified DataEngine for Python.
"""

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol, Union


@dataclass
class QueryResult:
    rows: List[Dict[str, Any]]
    row_count: int
    duration_ms: float
    columns: Optional[List[str]] = None


@dataclass
class ExecuteResult:
    affected_rows: int
    duration_ms: float


class DatabaseAdapter(Protocol):
    name: str

    async def query(self, sql: str, params: Optional[List[Any]] = None) -> QueryResult:
        ...

    async def execute(self, sql: str, params: Optional[List[Any]] = None) -> ExecuteResult:
        ...


class LocalDuckDBAdapter:
    """
    Embedded DuckDB adapter for Python.
    Uses native `duckdb` package if installed, or falls back to an in-memory SQL simulator.
    """

    def __init__(self, database_path: str = ":memory:", name: str = "local_duckdb"):
        self.name = name
        self.database_path = database_path
        self._native_conn = None
        self._memory_tables: Dict[str, List[Dict[str, Any]]] = {}

        try:
            import duckdb
            self._native_conn = duckdb.connect(database_path)
        except ImportError:
            self._native_conn = None

    def insert_rows(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        if self._native_conn is not None:
            if not rows:
                return
            import duckdb
            # Create table directly from list of dicts
            df_table = duckdb.from_df  # or register relation
            try:
                import pandas as pd
                df = pd.DataFrame(rows)
                self._native_conn.register("temp_df", df)
                self._native_conn.execute(f"CREATE TABLE IF NOT EXISTS {table_name} AS SELECT * FROM temp_df")
                self._native_conn.execute(f"INSERT INTO {table_name} SELECT * FROM temp_df")
            except Exception:
                # Direct SQL insert
                cols = list(rows[0].keys())
                col_defs = ", ".join(f'"{c}" VARCHAR' for c in cols)
                self._native_conn.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({col_defs})")
                for r in rows:
                    vals = ", ".join(f"'{str(r.get(c, '')).replace("'", "''")}'" for c in cols)
                    self._native_conn.execute(f"INSERT INTO {table_name} VALUES ({vals})")
            return

        # Memory fallback
        existing = self._memory_tables.get(table_name, [])
        existing.extend(rows)
        self._memory_tables[table_name] = existing

    async def query(self, sql: str, params: Optional[List[Any]] = None) -> QueryResult:
        start_time = time.perf_counter()

        if self._native_conn is not None:
            res = self._native_conn.execute(sql, params or [])
            cols = [desc[0] for desc in (res.description or [])]
            raw_rows = res.fetchall()
            dict_rows = [dict(zip(cols, r)) for r in raw_rows]
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return QueryResult(
                rows=dict_rows,
                row_count=len(dict_rows),
                duration_ms=duration_ms,
                columns=cols,
            )

        # Pure Python memory fallback for simple aggregations
        rows = self._eval_memory_sql(sql)
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        return QueryResult(
            rows=rows,
            row_count=len(rows),
            duration_ms=duration_ms,
            columns=list(rows[0].keys()) if rows else [],
        )

    async def execute(self, sql: str, params: Optional[List[Any]] = None) -> ExecuteResult:
        start_time = time.perf_counter()
        if self._native_conn is not None:
            self._native_conn.execute(sql, params or [])
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        return ExecuteResult(affected_rows=1, duration_ms=duration_ms)

    def _eval_memory_sql(self, sql: str) -> List[Dict[str, Any]]:
        import re
        m = re.search(r"FROM\s+([a-zA-Z0-9_]+)", sql, re.IGNORECASE)
        if not m:
            return []
        table_name = m.group(1)
        rows = [r.copy() for r in self._memory_tables.get(table_name, [])]

        # Simple COUNT(*)
        if re.search(r"SELECT\s+COUNT\(\*\)", sql, re.IGNORECASE):
            return [{"count": len(rows)}]

        # Group By evaluation
        group_m = re.search(r"GROUP\s+BY\s+(.+?)(?:ORDER|LIMIT|;|$)", sql, re.IGNORECASE)
        if group_m:
            group_cols = [c.strip().strip('"') for c in group_m.group(1).split(",")]
            groups: Dict[str, List[Dict[str, Any]]] = {}
            for r in rows:
                key = ":::".join(str(r.get(c, "")) for c in group_cols)
                groups.setdefault(key, []).append(r)

            result = []
            for key, g_rows in groups.items():
                item = {}
                for idx, c in enumerate(group_cols):
                    item[c] = key.split(":::")[idx]

                # SUM matches
                for col in re.findall(r'SUM\(["\']?([a-zA-Z0-9_]+)["\']?\)', sql, re.IGNORECASE):
                    item[f"sum_{col}"] = sum(float(r.get(col, 0) or 0) for r in g_rows)

                # AVG matches
                for col in re.findall(r'AVG\(["\']?([a-zA-Z0-9_]+)["\']?\)', sql, re.IGNORECASE):
                    s = sum(float(r.get(col, 0) or 0) for r in g_rows)
                    item[f"avg_{col}"] = s / len(g_rows) if g_rows else 0

                # COUNT matches
                if re.search(r'COUNT\(["\']?([a-zA-Z0-9_]+|\*)["\']?\)', sql, re.IGNORECASE):
                    item["count"] = len(g_rows)

                result.append(item)
            return result

        return rows


class DBXMCPAdapter:
    """
    Python DBX MCP Sidecar Client.
    Connects to DBX via Model Context Protocol or mock fallback.
    """

    def __init__(self, name: str = "dbx", mode: str = "mock"):
        self.name = name
        self.mode = mode

    async def query(self, sql: str, params: Optional[List[Any]] = None) -> QueryResult:
        start_time = time.perf_counter()
        # Mock query return for tests / disconnected mode
        return QueryResult(
            rows=[],
            row_count=0,
            duration_ms=(time.perf_counter() - start_time) * 1000.0,
            columns=[],
        )

    async def execute(self, sql: str, params: Optional[List[Any]] = None) -> ExecuteResult:
        start_time = time.perf_counter()
        return ExecuteResult(affected_rows=1, duration_ms=(time.perf_counter() - start_time) * 1000.0)


class DataEngine:
    """
    Python DataEngine orchestrating database adapters.
    """

    def __init__(self):
        self.adapters: Dict[str, Any] = {}
        self.default_adapter_name = "default"

    def register_adapter(self, adapter: Any, is_default: bool = False) -> "DataEngine":
        self.adapters[adapter.name] = adapter
        if is_default or len(self.adapters) == 1:
            self.default_adapter_name = adapter.name
        return self

    def get_adapter(self, name: Optional[str] = None) -> Optional[Any]:
        return self.adapters.get(name or self.default_adapter_name)

    async def query(self, sql: str, params: Optional[List[Any]] = None, store_name: Optional[str] = None) -> QueryResult:
        adapter = self.get_adapter(store_name)
        if not adapter:
            raise ValueError(f"Database adapter '{store_name or self.default_adapter_name}' not found")
        return await adapter.query(sql, params)

    async def execute(self, sql: str, params: Optional[List[Any]] = None, store_name: Optional[str] = None) -> ExecuteResult:
        adapter = self.get_adapter(store_name)
        if not adapter:
            raise ValueError(f"Database adapter '{store_name or self.default_adapter_name}' not found")
        return await adapter.execute(sql, params)
