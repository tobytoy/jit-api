import pytest
from jit_api.observer import SchemaObserver


@pytest.mark.asyncio
async def test_observer_freeze_on_threshold():
    frozen_event_schema = None

    def on_freeze(schema):
        nonlocal frozen_event_schema
        frozen_event_schema = schema

    observer = SchemaObserver(stability_threshold=3, on_freeze=on_freeze)
    payload = {"customer": "Acme", "amount": 100, "tags": ["urgent", "vip"]}

    # Sample 1
    r1 = await observer.observe("invoice", payload, 0.95)
    assert r1["stable"] is False
    assert r1["consecutive_matches"] == 1

    # Sample 2
    r2 = await observer.observe("invoice", payload, 0.95)
    assert r2["stable"] is False
    assert r2["consecutive_matches"] == 2

    # Sample 3 (hits threshold 3)
    r3 = await observer.observe("invoice", payload, 0.95)
    assert r3["stable"] is True
    assert observer.is_frozen("invoice") is True
    assert frozen_event_schema is not None
    assert frozen_event_schema.fields["customer"].type == "string"
    assert frozen_event_schema.fields["amount"].type == "number"
    assert frozen_event_schema.fields["tags"].type == "array"
    assert frozen_event_schema.fields["tags"].item_type == "string"


@pytest.mark.asyncio
async def test_observer_signature_mismatch_reset():
    observer = SchemaObserver(stability_threshold=3)

    await observer.observe("test", {"amount": 100})
    await observer.observe("test", {"amount": 200})
    assert observer.get_metrics("test").consecutive_matches == 2

    # Mismatch (different type string instead of number)
    await observer.observe("test", {"amount": "not_a_number"})
    assert observer.get_metrics("test").consecutive_matches == 1


@pytest.mark.asyncio
async def test_observer_version_bump_on_reset():
    captured_schema = None

    def on_freeze(s):
        nonlocal captured_schema
        captured_schema = s

    observer = SchemaObserver(stability_threshold=1, on_freeze=on_freeze)

    assert observer.get_route_version("route_v") == 1
    await observer.observe("route_v", {"x": 1})
    assert captured_schema.version == 1

    # Reset route on Schema Drift
    observer.reset_route("route_v")
    assert observer.get_route_version("route_v") == 2
    assert observer.is_frozen("route_v") is False

    await observer.observe("route_v", {"x": "updated"})
    assert captured_schema.version == 2
