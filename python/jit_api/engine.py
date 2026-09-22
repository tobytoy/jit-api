import inspect
import time
from typing import Any, Callable, Dict, List, Optional, Type, Union
from pydantic import BaseModel, ValidationError, create_model

from .codegen import CodegenEngine
from .fallback_handler import FallbackHandler
from .needle_engine import NeedleEngine
from .observer import SchemaObserver
from .router import TypeSafeRouter
from .types import (
    IRSchema,
    JITExecutionResult,
    JITRequestContext,
    RouteDefinition,
    RouteHandler,
)
from .typesafe_client import TypeSafeClient


class JITEngine:
    def __init__(
        self,
        client: Optional[TypeSafeClient] = None,
        needle_engine: Optional[NeedleEngine] = None,
        stability_threshold: int = 5,
        confidence_threshold: float = 0.85,
        fallback_to_needle: bool = True,
        force_needle: bool = False,
        codegen_output_dir: Optional[str] = None,
        on_freeze: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_drift: Optional[Callable[[str, str], None]] = None,
    ):
        self.router = TypeSafeRouter(
            client=client,
            needle_engine=needle_engine,
            fallback_to_needle=fallback_to_needle,
            force_needle=force_needle,
        )
        self.codegen = CodegenEngine(codegen_output_dir)
        self.fast_path_validators: Dict[str, Type[BaseModel]] = {}
        self.on_freeze_callback = on_freeze
        self.on_drift_callback = on_drift

        async def _internal_on_freeze(schema: IRSchema):
            # 1. Compile static files across TS, Go, Python, IR
            codegen_res = self.codegen.compile(schema)

            # 2. Build dynamic in-memory Pydantic v2 validator for Phase 3
            self._mount_fast_path_validator(schema)

            if self.on_freeze_callback:
                if inspect.iscoroutinefunction(self.on_freeze_callback):
                    await self.on_freeze_callback(codegen_res)
                else:
                    self.on_freeze_callback(codegen_res)

        def _internal_on_drift(route: str, error: str, payload: Dict[str, Any]):
            # Remove fast-path validator to re-enter dynamic Phase 1 mode
            self.fast_path_validators.pop(route, None)
            if self.on_drift_callback:
                self.on_drift_callback(route, error)

        self.observer = SchemaObserver(
            stability_threshold=stability_threshold,
            confidence_threshold=confidence_threshold,
            on_freeze=_internal_on_freeze,
        )

        self.fallback = FallbackHandler(
            router=self.router,
            observer=self.observer,
            on_drift_detected=_internal_on_drift,
        )

    def register(self, route_def: RouteDefinition) -> "JITEngine":
        self.router.register(route_def)
        return self

    def route(
        self,
        name: str,
        description: str,
        intent: str,
        enum_fields: Optional[Dict[str, Dict[str, str]]] = None,
    ) -> Callable[[RouteHandler], RouteHandler]:
        """
        Pythonic decorator to register a route handler:
        @engine.route(name="create_invoice", description="...", intent="...")
        async def create_invoice(payload, ctx):
            return {"status": "ok"}
        """
        return self.router.route(
            name=name,
            description=description,
            intent=intent,
            enum_fields=enum_fields,
        )

    def _mount_fast_path_validator(self, schema: IRSchema) -> None:
        """
        Dynamically create high-speed Pydantic v2 model for 0ms Phase 3 execution
        """
        field_definitions: Dict[str, Any] = {}

        for name, field_meta in schema.fields.items():
            py_type = str
            if field_meta.type == "number":
                py_type = float
            elif field_meta.type == "boolean":
                py_type = bool
            elif field_meta.type == "array":
                item_t = (
                    float
                    if field_meta.item_type == "number"
                    else (bool if field_meta.item_type == "boolean" else str)
                )
                py_type = List[item_t]
            elif field_meta.type == "object":
                py_type = Dict[str, Any]

            default_val = ... if field_meta.required else None
            field_definitions[name] = (py_type, default_val)

        model = create_model(f"{schema.name}FastValidator", **field_definitions)
        self.fast_path_validators[schema.route] = model

    async def execute(
        self, payload: Dict[str, Any], explicit_route: Optional[str] = None
    ) -> JITExecutionResult:
        start_time = time.time()
        target_route = explicit_route or (
            payload.get("route") if isinstance(payload.get("route"), str) else None
        )

        is_target_frozen = target_route and self.observer.is_frozen(target_route)

        # -------------------------------------------------------------
        # Phase 3: Static Fast-Path (Pydantic v2, 0ms AI Latency)
        # -------------------------------------------------------------
        if is_target_frozen and target_route:
            validator = self.fast_path_validators.get(target_route)
            route_def = self.router.get_route(target_route)

            if validator and route_def:
                try:
                    # Validate natively in-memory via Pydantic v2 C-extension
                    validated = validator.model_validate(payload)
                    clean_data = validated.model_dump()

                    exec_time_ms = round((time.time() - start_time) * 1000, 2)
                    ctx = JITRequestContext(
                        route=target_route,
                        phase="phase3_frozen",
                        execution_time_ms=exec_time_ms,
                        ai_latency_ms=0.0,  # 0ms AI latency!
                        intent_confidence=1.0,
                        is_fallback=False,
                    )

                    data = await self.router._invoke_handler(
                        route_def.handler, clean_data, ctx
                    )
                    return JITExecutionResult(success=True, data=data, context=ctx)
                except ValidationError as val_err:
                    # Schema Drift detected! Downgrade to Phase 1 & re-arm Phase 2 for v2
                    fallback_res = await self.fallback.handle_fallback(
                        target_route, str(val_err), payload
                    )
                    return JITExecutionResult(
                        success=True,
                        data=fallback_res["result"],
                        context=fallback_res["context"],
                    )

        # -------------------------------------------------------------
        # Phase 1: Dynamic Semantic Routing (TypeSafe Jev or Needle)
        # -------------------------------------------------------------
        res = await self.router.handle(payload, preferred_route=target_route)

        # Phase 2: Observation & Stability Tracking
        obs = await self.observer.observe(
            res["route"],
            res["normalized_payload"],
            res["context"].intent_confidence,
        )

        res["context"].phase = "phase3_frozen" if obs["stable"] else "phase1_dynamic"

        return JITExecutionResult(
            success=True, data=res["result"], context=res["context"]
        )

    def get_route_status(self, route: str) -> Dict[str, Any]:
        return {
            "route": route,
            "is_frozen": self.observer.is_frozen(route),
            "metrics": self.observer.get_metrics(route),
            "frozen_schema": self.observer.get_frozen_schema(route),
        }
