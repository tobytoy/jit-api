from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, Dict, List, Literal, Optional, Union

LifecyclePhase = Literal["phase1_dynamic", "phase2_observing", "phase3_frozen"]
IRFieldType = Literal["string", "number", "boolean", "enum", "array", "object"]


@dataclass
class IRField:
    name: str
    type: IRFieldType
    required: bool = True
    enum_values: Optional[List[str]] = None
    description: Optional[str] = None
    item_type: Optional[IRFieldType] = None
    properties: Optional[Dict[str, "IRField"]] = None


@dataclass
class IRSchema:
    name: str
    version: int
    route: str
    fields: Dict[str, IRField]
    description: Optional[str] = None
    sample_payload: Optional[Dict[str, Any]] = None
    frozen_at: Optional[str] = None


@dataclass
class JITRequestContext:
    route: str
    phase: LifecyclePhase
    execution_time_ms: float
    ai_latency_ms: float
    intent_confidence: float = 1.0
    is_fallback: bool = False
    engine_used: Optional[Literal["typesafe", "needle"]] = None


@dataclass
class JITExecutionResult:
    success: bool
    data: Any = None
    error: Optional[str] = None
    context: Optional[JITRequestContext] = None


@dataclass
class StabilityMetrics:
    sample_count: int
    consecutive_matches: int
    required_threshold: int
    confidence_threshold: float
    avg_confidence: float
    is_stable: bool


# Route handler can be async or sync
RouteHandler = Callable[[Dict[str, Any], JITRequestContext], Union[Any, Coroutine[Any, Any, Any]]]


@dataclass
class RouteDefinition:
    route: str
    description: str
    intent_criteria: str
    handler: RouteHandler
    enum_fields: Optional[Dict[str, Dict[str, str]]] = None
