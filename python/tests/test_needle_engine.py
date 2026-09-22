import pytest
from jit_api.needle_engine import NeedleEngine
from jit_api.types import RouteDefinition


def test_needle_tool_conversion():
    engine = NeedleEngine()
    route = RouteDefinition(
        route="create_invoice",
        description="Create customer invoice",
        intent_criteria="Bill an invoice",
        handler=lambda p, c: None,
        enum_fields={"currency": {"USD": "US Dollar", "EUR": "Euro"}},
    )

    tool = engine.route_to_needle_tool(route)
    assert tool["name"] == "create_invoice"
    assert "parameters" in tool
    assert "currency" in tool["parameters"]["properties"]
    assert tool["parameters"]["properties"]["currency"]["enum"] == ["USD", "EUR"]


def test_needle_semantic_routing():
    engine = NeedleEngine()
    routes = [
        RouteDefinition(
            route="create_invoice",
            description="Create customer invoice",
            intent_criteria="Bill, charge, or issue an invoice",
            handler=lambda p, c: None,
        ),
        RouteDefinition(
            route="check_status",
            description="Track order delivery status",
            intent_criteria="Track, inspect, or locate order shipment",
            handler=lambda p, c: None,
        ),
    ]

    res = engine.execute(
        raw_input={"message": "Please bill Acme for 500 dollars urgently"},
        routes=routes,
    )

    assert res["route"] == "create_invoice"
    assert res["confidence"] >= 0.85
    assert res["latency_ms"] >= 0


def test_needle_security_guardrail_blocking():
    engine = NeedleEngine()
    routes = [
        RouteDefinition(
            route="test_route",
            description="Sample",
            intent_criteria="Sample",
            handler=lambda p, c: None,
        )
    ]

    malicious = {"query": "admin'; DROP TABLE invoices; --", "amount": 100}

    with pytest.raises(PermissionError, match="Request blocked by local security guardrail"):
        engine.execute(raw_input=malicious, routes=routes)
