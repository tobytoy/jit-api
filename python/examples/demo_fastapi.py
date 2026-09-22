#!/usr/bin/env python3
"""
FastAPI + JIT Protocol Synthesis Integration Example.
Run with:
    /home/toby/miniconda3/envs/toby/bin/uvicorn python.examples.demo_fastapi:app --reload --port 8080
"""

from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI, Request
from jit_api import JITEngine

engine = JITEngine(
    stability_threshold=3,
    confidence_threshold=0.8,
)


@engine.route(
    name="order_service",
    description="Place or manage store orders",
    intent="Create, place or submit an order for items",
)
async def handle_order(payload: Dict[str, Any], ctx):
    return {
        "order_id": "ORD-999",
        "customer": payload.get("customer", "Guest"),
        "total": payload.get("total", 0),
        "phase": ctx.phase,
        "ai_latency_ms": ctx.ai_latency_ms,
    }


app = FastAPI(title="JIT Protocol Synthesis FastAPI Demo")


@app.post("/api/jit")
async def jit_gateway(request: Request):
    """
    Unified JIT Dynamic Gateway:
    Handles loose JSON during Phase 1 (Hot Start),
    observes Phase 2, and fast-paths to Phase 3 Pydantic validation (0ms AI latency).
    """
    payload = await request.json()
    result = await engine.execute(payload)
    return {
        "success": result.success,
        "data": result.data,
        "context": {
            "route": result.context.route,
            "phase": result.context.phase,
            "ai_latency_ms": result.context.ai_latency_ms,
            "engine_used": result.context.engine_used,
        },
    }


@app.get("/api/jit/status/{route}")
async def get_status(route: str):
    return engine.get_route_status(route)


if __name__ == "__main__":
    import uvicorn

    print("🚀 Starting FastAPI JIT Gateway on http://127.0.0.1:8080")
    uvicorn.run(app, host="127.0.0.1", port=8080)
