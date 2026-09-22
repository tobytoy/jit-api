import pytest
from jit_api.engine import JITEngine
from jit_api.typesafe_client import TypeSafeClient


@pytest.mark.asyncio
async def test_full_lifecycle_and_fallback():
    drift_count = 0

    def on_drift(route, err):
        nonlocal drift_count
        drift_count += 1

    engine = JITEngine(
        stability_threshold=2,
        confidence_threshold=0.8,
        on_drift=on_drift,
    )

    # Register mock service using Pythonic decorator
    @engine.route(
        name="create_invoice",
        description="Create customer invoice",
        intent="Bill, charge or invoice a customer",
        enum_fields={"currency": {"USD": "US Dollar", "EUR": "Euro"}},
    )
    async def create_invoice(payload, ctx):
        return {
            "invoice_id": "INV-100",
            "customer": payload.get("customer"),
            "amount": payload.get("amount"),
            "currency": payload.get("currency", "USD"),
            "phase": ctx.phase,
            "ai_latency_ms": ctx.ai_latency_ms,
        }

    # 1. Execution 1: Phase 1
    p1 = {"customer": "Alpha Corp", "amount": 100, "currency": "USD"}
    res1 = await engine.execute(p1, explicit_route="create_invoice")
    assert res1.success is True
    assert res1.context.route == "create_invoice"
    assert res1.context.phase == "phase1_dynamic"

    # 2. Execution 2 (Threshold = 2): Freeze triggered, enters Phase 3
    p2 = {"customer": "Beta Corp", "amount": 200, "currency": "USD"}
    res2 = await engine.execute(p2, explicit_route="create_invoice")
    assert res2.success is True
    assert engine.get_route_status("create_invoice")["is_frozen"] is True

    # 3. Execution 3: Phase 3 Fast-Path (0ms AI latency!)
    p3 = {"customer": "Gamma Corp", "amount": 300, "currency": "USD"}
    res3 = await engine.execute(p3, explicit_route="create_invoice")
    assert res3.success is True
    assert res3.context.phase == "phase3_frozen"
    assert res3.context.ai_latency_ms == 0.0

    # 4. Execution 4: Schema Drift (amount sent as string, incompatible with Pydantic float)
    drifted = {"customer": "Delta Corp", "amount": "INVALID_NOT_A_NUMBER", "currency": "USD"}
    res_drift = await engine.execute(drifted, explicit_route="create_invoice")
    assert res_drift.success is True
    assert res_drift.context.is_fallback is True
    assert drift_count == 1

    # Route is unfrozen and upgraded to v2 for observation
    assert engine.get_route_status("create_invoice")["is_frozen"] is False
    assert engine.observer.get_route_version("create_invoice") == 2


@pytest.mark.asyncio
async def test_needle_fallback_in_engine():
    client_no_key = TypeSafeClient(api_key="")
    assert client_no_key.has_api_key() is False

    engine = JITEngine(
        client=client_no_key,
        stability_threshold=2,
    )

    @engine.route(
        name="echo_test",
        description="Echo input text",
        intent="Echo, repeat or return text",
    )
    def echo_handler(payload, ctx):
        return {"echo": payload.get("text"), "engine": ctx.engine_used}

    res = await engine.execute({"text": "Hello world from Needle"})
    assert res.success is True
    assert res.context.route == "echo_test"
    assert res.context.engine_used == "needle"
    assert res.data["engine"] == "needle"
