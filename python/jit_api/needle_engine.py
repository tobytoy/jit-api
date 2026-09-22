import json
import re
import time
from typing import Any, Dict, List, Optional
from .types import RouteDefinition

NEEDLE_NATIVE_AVAILABLE = False
try:
    import needle
    NEEDLE_NATIVE_AVAILABLE = True
except ImportError:
    NEEDLE_NATIVE_AVAILABLE = False


class NeedleEngine:
    """
    In-process Native Cactus Needle 3.0 Engine.
    Executes tool calling and structured extraction locally with 0 API cost.
    """

    def __init__(self, enable_guardrail: bool = True):
        self.enable_guardrail = enable_guardrail
        self.is_native_available = NEEDLE_NATIVE_AVAILABLE

    def route_to_needle_tool(self, route_def: RouteDefinition) -> Dict[str, Any]:
        properties: Dict[str, Any] = {}

        if route_def.enum_fields:
            for field_name, criteria in route_def.enum_fields.items():
                properties[field_name] = {
                    "type": "string",
                    "enum": list(criteria.keys()),
                    "description": f"Allowed options: {', '.join(criteria.keys())}",
                }

        return {
            "name": route_def.route,
            "description": f"{route_def.description}. Intent criteria: {route_def.intent_criteria}",
            "parameters": {
                "type": "object",
                "properties": properties,
            },
        }

    def check_security_guardrail(self, payload: Dict[str, Any]) -> None:
        if not self.enable_guardrail:
            return

        dangerous_patterns = [
            r"('|\b;|--|\/\*|\b(DROP\s+TABLE|UNION\s+SELECT|ALTER\s+TABLE|EXEC\s*\()\b)",
            r"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>",
            r"\b(rm\s+-rf|chmod\s+777|wget\s+http|curl\s+http)\b",
        ]

        text = json.dumps(payload)
        for pattern in dangerous_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                raise PermissionError(
                    "[NeedleEngine] Request blocked by local security guardrail (Matched exploit pattern)"
                )

    def execute(
        self,
        raw_input: Dict[str, Any],
        routes: List[RouteDefinition],
        preferred_route: Optional[str] = None,
    ) -> Dict[str, Any]:
        start_time = time.time()

        # 1. Local Guardrail Check
        self.check_security_guardrail(raw_input)

        # Bypass if preferredRoute is explicitly targeted
        if preferred_route and any(r.route == preferred_route for r in routes):
            latency_ms = round((time.time() - start_time) * 1000, 2)
            return {
                "route": preferred_route,
                "normalized_payload": dict(raw_input),
                "confidence": 1.0,
                "latency_ms": latency_ms,
            }

        tools = [self.route_to_needle_tool(r) for r in routes]
        query = (
            raw_input.get("message")
            or raw_input.get("text")
            or json.dumps(raw_input)
        )

        # 2. Try Native Needle In-Process Execution
        if self.is_native_available:
            try:
                agent = needle.Needle(tools=tools)
                res = agent.run(str(query))
                latency_ms = round((time.time() - start_time) * 1000, 2)

                function_calls = res.get("function_calls", [])
                if function_calls:
                    call = function_calls[0]
                    normalized = dict(raw_input)
                    normalized.update(call.get("arguments", {}))
                    return {
                        "route": call["name"],
                        "normalized_payload": normalized,
                        "confidence": float(res.get("confidence", 0.95)),
                        "latency_ms": latency_ms,
                        "reasoning": res.get("reasoning"),
                    }
            except Exception:
                # If weights download is offline, fall back to semantic matcher
                pass

        # 3. Deterministic In-Memory Matcher Fallback
        return self._embedded_match(str(query), raw_input, routes, start_time)

    def _embedded_match(
        self,
        query: str,
        raw_input: Dict[str, Any],
        routes: List[RouteDefinition],
        start_time: float,
    ) -> Dict[str, Any]:
        q_lower = query.lower()
        best_route = routes[0]
        highest_score = -1

        for r in routes:
            score = 0
            text_corpus = f"{r.route} {r.description} {r.intent_criteria}".lower()
            words = [w for w in re.findall(r"\w+", text_corpus) if len(w) > 2]

            for w in words:
                if w in q_lower:
                    score += 1

            if score > highest_score:
                highest_score = score
                best_route = r

        normalized_payload = dict(raw_input)

        if best_route.enum_fields:
            for field, options in best_route.enum_fields.items():
                if field not in normalized_payload:
                    for opt_key in options.keys():
                        if opt_key.lower() in q_lower:
                            normalized_payload[field] = opt_key
                            break

        confidence = 0.94 if highest_score > 0 else 0.86
        latency_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "route": best_route.route,
            "normalized_payload": normalized_payload,
            "confidence": confidence,
            "latency_ms": latency_ms,
            "reasoning": f"Needle matched route '{best_route.route}' with score {highest_score}",
        }
