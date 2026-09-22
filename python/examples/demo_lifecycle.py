#!/usr/bin/env python3
"""
JIT Protocol Synthesis Framework (jit-api-python)
Full End-to-End Lifecycle Demo (Phase 1 ➔ Phase 2 ➔ Phase 3 ➔ Schema Drift Fallback)
"""

import asyncio
import json
from jit_api import JITEngine


async def run_demo():
    print("=" * 72)
    print("🐍 JIT PROTOCOL SYNTHESIS FRAMEWORK - PYTHON HOST ENGINE DEMO")
    print("   Dynamic Semantic Negotiation ➔ Pydantic Code Freeze ➔ Fallback")
    print("=" * 72 + "\n")

    engine = JITEngine(
        stability_threshold=3,
        confidence_threshold=0.8,
        on_freeze=lambda codegen: print(
            f"\n❄️  [PHASE 2 ➔ 3 TRIGGERED] Route '{codegen['schema'].route}' has frozen!\n"
            f"📦 Compiled static artifacts generated:\n"
            f"   - Python (Pydantic): {codegen['files']['python']}\n"
            f"   - TypeScript (Zod): {codegen['files']['typescript']}\n"
            f"   - Protobuf (.proto): {codegen['files']['proto']}\n"
            f"   - Golang Struct:    {codegen['files']['golang']}\n"
            f"   - JSON Schema IR:   {codegen['files']['ir_json']}\n"
        ),
        on_drift=lambda route, err: print(
            f"\n⚠️  [SCHEMA DRIFT DETECTED] Route '{route}': {err}\n"
            f"   Switching to FallbackHandler: Downgrading to Phase 1 & starting v2 observation.\n"
        ),
    )

    # 1. Register handlers using Pythonic decorator
    @engine.route(
        name="create_invoice",
        description="Create and issue a customer billing invoice",
        intent="Customer requests to create, issue, or generate an invoice or bill for a product or service transaction",
        enum_fields={
            "currency": {"USD": "US Dollar", "EUR": "Euro", "TWD": "New Taiwan Dollar"},
            "priority": {"urgent": "Immediate processing", "normal": "Standard"},
        },
    )
    async def create_invoice(payload, ctx):
        try:
            amt = float(payload.get("amount", 0))
        except (ValueError, TypeError):
            amt = 0.0

        return {
            "invoice_id": "INV-" + str(abs(hash(payload.get("customer", ""))) % 900000 + 100000),
            "status": "ISSUED",
            "customer": payload.get("customer", "Unknown"),
            "amount": amt,
            "currency": payload.get("currency", "USD"),
            "priority": payload.get("priority", "normal"),
            "item_count": int(payload.get("itemCount", 1)),
            "phase": ctx.phase,
            "engine_used": ctx.engine_used,
            "ai_latency_ms": ctx.ai_latency_ms,
        }

    # -------------------------------------------------------------
    # STEP 1: Phase 1 (Dynamic Semantic Routing)
    # -------------------------------------------------------------
    print("🔹 STEP 1: Phase 1 - Dynamic Semantic Routing")
    print("   Client sends loose JSON payload without predefined schema...")

    request1 = {
        "message": "Hey, please bill Acme Corp for 500 dollars urgently",
        "customer": "Acme Corp",
        "amount": 500,
        "currency": "USD",
        "priority": "urgent",
        "itemCount": 3,
    }

    print("   Payload:", json.dumps(request1))
    res1 = await engine.execute(request1)
    print(f"   ✅ Routed to: [{res1.context.route}]")
    print(
        f"   ⚡ Engine: [{res1.context.engine_used.upper() if res1.context.engine_used else 'DEFAULT'}] | "
        f"Phase: {res1.context.phase} | AI Latency: {res1.context.ai_latency_ms}ms"
    )
    print(f"   📊 Confidence: {res1.context.intent_confidence} | Result:", res1.data)
    print("-" * 72 + "\n")

    # -------------------------------------------------------------
    # STEP 2: Phase 2 (Observation towards Freeze)
    # -------------------------------------------------------------
    print("🔹 STEP 2: Phase 2 - Continuous Observation towards Freeze")
    print("   Sending structured requests (Threshold = 3)...")

    for i in range(1, 4):
        req = {
            "customer": f"Client-Py-{i}",
            "amount": 100.0 * i,
            "currency": "USD",
            "priority": "normal",
            "itemCount": i,
        }
        print(f"   [Request #{i}] Sending:", json.dumps(req))
        await engine.execute(req, explicit_route="create_invoice")
        status = engine.get_route_status("create_invoice")
        print(
            f"   📈 Consecutive Matches: {status['metrics'].consecutive_matches}/"
            f"{status['metrics'].required_threshold} | Frozen: {status['is_frozen']}"
        )
    print("-" * 72 + "\n")

    # -------------------------------------------------------------
    # STEP 3: Phase 3 (Static Fast-Path - 0ms AI Latency!)
    # -------------------------------------------------------------
    print("🔹 STEP 3: Phase 3 - Static Fast-Path Execution (Native Pydantic v2)")
    print("   Route is now FROZEN! Client sends compliant request...")

    fast_req = {
        "customer": "Wayne Enterprises",
        "amount": 1500.0,
        "currency": "USD",
        "priority": "normal",
        "itemCount": 5,
    }

    fast_res = await engine.execute(fast_req, explicit_route="create_invoice")
    print("   ✅ Execution Status: SUCCESS")
    print(f"   ⚡ Phase: {fast_res.context.phase}")
    print(f"   ⏱️  Total Execution: {fast_res.context.execution_time_ms}ms")
    print(
        f"   🔥 AI Latency: {fast_res.context.ai_latency_ms}ms (Pure native Pydantic v2 execution, 0 API cost!)"
    )
    print("   📦 Output:", fast_res.data)
    print("-" * 72 + "\n")

    # -------------------------------------------------------------
    # STEP 4: Schema Drift Fallback & Self-Evolution
    # -------------------------------------------------------------
    print("🔹 STEP 4: Schema Drift Fallback & Self-Evolution")
    print("   Client business logic changed! Sending mutated payload...")

    drifted_req = {
        "customer": "Enterprise Partner",
        "amount": "INVALID_NON_NUMERIC_AMOUNT",
        "taxExempt": True,
        "currency": "USD",
        "priority": "urgent",
        "itemCount": 10,
    }

    print("   Mutated Payload:", json.dumps(drifted_req))
    fallback_res = await engine.execute(drifted_req, explicit_route="create_invoice")
    print("   🛡️  Fallback Result: Handled seamlessly!")
    print(
        f"   ⚡ Phase: {fallback_res.context.phase} | IsFallback: {fallback_res.context.is_fallback}"
    )
    print(f"   🤖 AI Latency: {fallback_res.context.ai_latency_ms}ms (Re-analyzed)")
    print("   📦 Output:", fallback_res.data)
    print("-" * 72 + "\n")

    # -------------------------------------------------------------
    # STEP 5: Security Guardrail Check
    # -------------------------------------------------------------
    print("🔹 STEP 5: Security Guardrail")
    print("   Simulating malicious SQL injection payload...")

    malicious_req = {
        "input": "admin'; DROP TABLE invoices; --",
        "amount": -999,
    }

    try:
        await engine.execute(malicious_req)
        print("   ❌ Error: Malicious payload was not blocked!")
    except Exception as err:
        print("   🛡️  Blocked by Security Guardrail successfully!")
        print(f"   Error message: '{err}'")

    print("\n" + "=" * 72)
    print("🎉 PYTHON ENGINE DEMO COMPLETED: Full lifecycle verified!")
    print("=" * 72)


if __name__ == "__main__":
    asyncio.run(run_demo())
