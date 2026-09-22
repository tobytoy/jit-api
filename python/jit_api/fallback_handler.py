import sys
from typing import Any, Callable, Dict, Optional
from .observer import SchemaObserver
from .router import TypeSafeRouter


class FallbackHandler:
    """
    Handles Phase 3 Fast-Path validation errors (Schema Drift)
    by downgrading the request back to Phase 1 dynamic semantic resolution
    and re-arming Phase 2 observation for the next contract version (v2, v3...).
    """

    def __init__(
        self,
        router: TypeSafeRouter,
        observer: SchemaObserver,
        on_drift_detected: Optional[Callable[[str, str, Dict[str, Any]], None]] = None,
    ):
        self.router = router
        self.observer = observer
        self.on_drift_detected = on_drift_detected or self._default_log_drift

    @staticmethod
    def _default_log_drift(route: str, error: str, payload: Dict[str, Any]) -> None:
        sys.stderr.write(
            f"[FallbackHandler] ⚠️ Schema drift detected on '{route}': {error}. Downgrading to Phase 1.\n"
        )
        sys.stderr.flush()

    async def handle_fallback(
        self, route: str, validation_error: str, raw_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        # 1. Notify drift
        self.on_drift_detected(route, validation_error, raw_payload)

        # 2. Reset observer for this route to initiate v2 observation
        self.observer.reset_route(route)

        # 3. Reroute through Phase 1 dynamic semantic router
        res = await self.router.handle(raw_payload, preferred_route=route)

        # 4. Mark context as fallback
        res["context"].is_fallback = True

        # 5. Record drifted payload as sample 1 of the new version
        await self.observer.observe(
            route, res["normalized_payload"], res["context"].intent_confidence
        )

        return res
