"""
JIT Protocol Synthesis Framework - Python Host Engine (jit-api-python)
Dynamic Semantic Negotiation ➔ Static Code Freeze ➔ Fallback
Powered by TypeSafe (Jev) and Cactus Needle 3.0
"""

from .engine import JITEngine
from .types import (
    IRField,
    IRSchema,
    JITExecutionResult,
    JITRequestContext,
    LifecyclePhase,
    RouteDefinition,
    StabilityMetrics,
)
from .typesafe_client import TypeSafeClient
from .needle_engine import NeedleEngine
from .router import TypeSafeRouter
from .observer import SchemaObserver
from .fallback_handler import FallbackHandler
from .codegen import CodegenEngine
from .data import (
    DataEngine,
    LocalDuckDBAdapter,
    DBXMCPAdapter,
    QueryResult,
    ExecuteResult,
)
from .analytics import Dataset
from .visual import Chart
from .share import Publisher
from . import ui

__all__ = [
    "JITEngine",
    "TypeSafeClient",
    "NeedleEngine",
    "TypeSafeRouter",
    "SchemaObserver",
    "FallbackHandler",
    "CodegenEngine",
    "DataEngine",
    "LocalDuckDBAdapter",
    "DBXMCPAdapter",
    "QueryResult",
    "ExecuteResult",
    "Dataset",
    "Chart",
    "Publisher",
    "ui",
    "IRField",
    "IRSchema",
    "JITExecutionResult",
    "JITRequestContext",
    "LifecyclePhase",
    "RouteDefinition",
    "StabilityMetrics",
]
