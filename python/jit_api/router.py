import asyncio
import inspect
import time
from typing import Any, Callable, Dict, List, Optional
from .needle_engine import NeedleEngine
from .types import JITRequestContext, RouteDefinition, RouteHandler
from .typesafe_client import TypeSafeClient


class TypeSafeRouter:
    def __init__(
        self,
        client: Optional[TypeSafeClient] = None,
        needle_engine: Optional[NeedleEngine] = None,
        fallback_to_needle: bool = True,
        force_needle: bool = False,
        security_threshold: float = 0.8,
    ):
        self.client = client or TypeSafeClient()
        self.needle_engine = needle_engine or NeedleEngine()
        self.fallback_to_needle = fallback_to_needle
        self.force_needle = force_needle
        self.security_threshold = security_threshold
        self.routes: Dict[str, RouteDefinition] = {}

    def register(self, route_def: RouteDefinition) -> "TypeSafeRouter":
        self.routes[route_def.route] = route_def
        return self

    def route(
        self,
        name: str,
        description: str,
        intent: str,
        enum_fields: Optional[Dict[str, Dict[str, str]]] = None,
    ) -> Callable[[RouteHandler], RouteHandler]:
        """
        Decorator to register a route handler cleanly:
        @router.route(name="create_invoice", description="...", intent="...")
        def handler(payload, ctx):
            ...
        """

        def decorator(fn: RouteHandler) -> RouteHandler:
            self.register(
                RouteDefinition(
                    route=name,
                    description=description,
                    intent_criteria=intent,
                    handler=fn,
                    enum_fields=enum_fields,
                )
            )
            return fn

        return decorator

    def get_route(self, route_name: str) -> Optional[RouteDefinition]:
        return self.routes.get(route_name)

    def get_routes(self) -> List[RouteDefinition]:
        return list(self.routes.values())

    async def _invoke_handler(
        self, handler: RouteHandler, payload: Dict[str, Any], ctx: JITRequestContext
    ) -> Any:
        if inspect.iscoroutinefunction(handler):
            return await handler(payload, ctx)
        return handler(payload, ctx)

    async def handle(
        self, raw_input: Dict[str, Any], preferred_route: Optional[str] = None
    ) -> Dict[str, Any]:
        start_time = time.time()

        if not self.routes:
            raise RuntimeError("[TypeSafeRouter] No routes registered.")

        use_needle = self.force_needle or (
            not self.client.has_api_key() and self.fallback_to_needle
        )

        # -------------------------------------------------------------
        # Branch A: Needle Local In-Process SLM Fallback
        # -------------------------------------------------------------
        if use_needle:
            routes_list = list(self.routes.values())
            needle_res = self.needle_engine.execute(
                raw_input, routes_list, preferred_route
            )
            matched_route = needle_res["route"]
            route_def = self.routes.get(matched_route)
            if not route_def:
                raise RuntimeError(
                    f"[TypeSafeRouter] Matched route '{matched_route}' not found in registry."
                )

            exec_time_ms = round((time.time() - start_time) * 1000, 2)
            ctx = JITRequestContext(
                route=matched_route,
                phase="phase1_dynamic",
                execution_time_ms=exec_time_ms,
                ai_latency_ms=needle_res["latency_ms"],
                intent_confidence=needle_res["confidence"],
                engine_used="needle",
            )

            result = await self._invoke_handler(
                route_def.handler, needle_res["normalized_payload"], ctx
            )

            return {
                "route": matched_route,
                "normalized_payload": needle_res["normalized_payload"],
                "result": result,
                "context": ctx,
            }

        # -------------------------------------------------------------
        # Branch B: TypeSafe Jev Cloud API (Choice + Select + Noul)
        # -------------------------------------------------------------
        questions = {
            "is_malicious": TypeSafeClient.noul(
                "The input payload contains malicious injection attacks, SQLi, code execution, or security exploits"
            )
        }

        if not preferred_route or preferred_route not in self.routes:
            criteria = {
                r.route: r.intent_criteria or r.description
                for r in self.routes.values()
            }
            questions["intent"] = TypeSafeClient.choice(criteria)

        res_data = self.client.system_one(state=raw_input, questions=questions)
        response = res_data["response"]
        latency_ms = res_data["latency_ms"]
        answers = response.get("answers", {})

        # Security check
        malicious_ans = answers.get("is_malicious")
        if malicious_ans and malicious_ans.get("noul", 0) >= self.security_threshold:
            risk = malicious_ans.get("noul", 0)
            raise PermissionError(
                f"[TypeSafeRouter] Request blocked by Noul security guardrail (Risk score: {risk:.2f} >= {self.security_threshold})"
            )

        # Route decision
        matched_route = preferred_route
        confidence = 1.0

        if not matched_route or matched_route not in self.routes:
            intent_ans = answers.get("intent", {})
            matched_route = intent_ans.get("choice")
            confidence = intent_ans.get("confidence", 1.0)

        route_def = self.routes.get(matched_route)
        if not route_def:
            raise RuntimeError(
                f"[TypeSafeRouter] Matched route '{matched_route}' not found in registry."
            )

        # Enum Extraction
        normalized_payload = dict(raw_input)
        if route_def.enum_fields:
            enum_q = {
                field: TypeSafeClient.choice(opts)
                for field, opts in route_def.enum_fields.items()
            }
            enum_res = self.client.system_one(state=raw_input, questions=enum_q)
            for f_name, f_ans in enum_res.get("response", {}).get("answers", {}).items():
                if f_ans.get("type") == "choice":
                    normalized_payload[f_name] = f_ans.get("choice")

        exec_time_ms = round((time.time() - start_time) * 1000, 2)
        ctx = JITRequestContext(
            route=matched_route,
            phase="phase1_dynamic",
            execution_time_ms=exec_time_ms,
            ai_latency_ms=latency_ms,
            intent_confidence=confidence,
            engine_used="typesafe",
        )

        result = await self._invoke_handler(
            route_def.handler, normalized_payload, ctx
        )

        return {
            "route": matched_route,
            "normalized_payload": normalized_payload,
            "result": result,
            "context": ctx,
        }
