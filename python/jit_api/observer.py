import datetime
import inspect
from typing import Any, Callable, Dict, List, Optional, Union
from .types import IRField, IRFieldType, IRSchema, StabilityMetrics


class RouteObservationState:
    def __init__(self):
        self.samples: List[Dict[str, Any]] = []
        self.current_signature: Optional[str] = None
        self.consecutive_matches: int = 0
        self.is_frozen: bool = False
        self.frozen_schema: Optional[IRSchema] = None


class SchemaObserver:
    def __init__(
        self,
        stability_threshold: int = 5,
        confidence_threshold: float = 0.85,
        on_freeze: Optional[Callable[[IRSchema], Any]] = None,
    ):
        self.stability_threshold = stability_threshold
        self.confidence_threshold = confidence_threshold
        self.on_freeze = on_freeze
        self.states: Dict[str, RouteObservationState] = {}
        self.route_versions: Dict[str, int] = {}

    def infer_type(self, value: Any) -> IRFieldType:
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, (int, float)):
            return "number"
        if isinstance(value, list):
            return "array"
        if isinstance(value, dict):
            return "object"
        return "string"

    def generate_signature(self, payload: Dict[str, Any]) -> str:
        parts = []
        for key in sorted(payload.keys()):
            val = payload[key]
            val_type = self.infer_type(val)
            if val_type == "object" and isinstance(val, dict):
                parts.append(f"{key}:{{{self.generate_signature(val)}}}")
            elif val_type == "array" and isinstance(val, list):
                item_type = self.infer_type(val[0]) if val else "unknown"
                parts.append(f"{key}:array[{item_type}]")
            else:
                parts.append(f"{key}:{val_type}")
        return ";".join(parts)

    def extract_ir_schema(
        self, route: str, sample: Dict[str, Any], version: int = 1
    ) -> IRSchema:
        fields: Dict[str, IRField] = {}

        for key, val in sample.items():
            field_type = self.infer_type(val)
            field = IRField(name=key, type=field_type, required=True)

            if field_type == "array" and isinstance(val, list):
                field.item_type = self.infer_type(val[0]) if val else "string"
            elif field_type == "object" and isinstance(val, dict):
                nested: Dict[str, IRField] = {}
                for sub_k, sub_v in val.items():
                    nested[sub_k] = IRField(
                        name=sub_k, type=self.infer_type(sub_v), required=True
                    )
                field.properties = nested

            fields[key] = field

        pascal_name = "".join(part.capitalize() for part in route.split("_")) + "Request"

        return IRSchema(
            name=pascal_name,
            version=version,
            route=route,
            fields=fields,
            sample_payload=sample,
            frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

    def get_route_version(self, route: str) -> int:
        return self.route_versions.get(route, 1)

    def reset_route(self, route: str) -> None:
        next_version = self.get_route_version(route) + 1
        self.route_versions[route] = next_version
        if route in self.states:
            del self.states[route]

    def is_frozen(self, route: str) -> bool:
        return self.states.get(route, RouteObservationState()).is_frozen

    def get_frozen_schema(self, route: str) -> Optional[IRSchema]:
        return self.states.get(route, RouteObservationState()).frozen_schema

    def get_metrics(self, route: str) -> StabilityMetrics:
        state = self.states.get(route)
        if not state or not state.samples:
            return StabilityMetrics(
                sample_count=0,
                consecutive_matches=0,
                required_threshold=self.stability_threshold,
                confidence_threshold=self.confidence_threshold,
                avg_confidence=0.0,
                is_stable=False,
            )

        recent = state.samples[-self.stability_threshold :]
        avg_conf = sum(s["confidence"] for s in recent) / len(recent)
        is_stable = (
            state.consecutive_matches >= self.stability_threshold
            and avg_conf >= self.confidence_threshold
        )

        return StabilityMetrics(
            sample_count=len(state.samples),
            consecutive_matches=state.consecutive_matches,
            required_threshold=self.stability_threshold,
            confidence_threshold=self.confidence_threshold,
            avg_confidence=round(avg_conf, 3),
            is_stable=is_stable,
        )

    async def observe(
        self, route: str, payload: Dict[str, Any], confidence: float = 1.0
    ) -> Dict[str, Any]:
        state = self.states.setdefault(route, RouteObservationState())

        if state.is_frozen and state.frozen_schema:
            return {
                "stable": True,
                "consecutive_matches": state.consecutive_matches,
                "metrics": self.get_metrics(route),
                "frozen_schema": state.frozen_schema,
            }

        signature = self.generate_signature(payload)
        state.samples.append(
            {
                "payload": payload,
                "signature": signature,
                "confidence": confidence,
            }
        )

        if state.current_signature == signature:
            state.consecutive_matches += 1
        else:
            state.current_signature = signature
            state.consecutive_matches = 1

        metrics = self.get_metrics(route)

        if metrics.is_stable and not state.is_frozen:
            state.is_frozen = True
            schema = self.extract_ir_schema(
                route, payload, version=self.get_route_version(route)
            )
            state.frozen_schema = schema

            if self.on_freeze:
                if inspect.iscoroutinefunction(self.on_freeze):
                    await self.on_freeze(schema)
                else:
                    self.on_freeze(schema)

            return {
                "stable": True,
                "consecutive_matches": state.consecutive_matches,
                "metrics": metrics,
                "frozen_schema": schema,
            }

        return {
            "stable": False,
            "consecutive_matches": state.consecutive_matches,
            "metrics": metrics,
        }
