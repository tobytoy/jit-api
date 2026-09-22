#!/usr/bin/env python3
"""
JIT Protocol Synthesis - FastAPI Server Example

Run with:
  /home/toby/miniconda3/envs/toby/bin/python docs/examples/py_server.py
"""

import sys
import os
import uvicorn
from fastapi import FastAPI, Request, HTTPException

# Add python directory to sys.path
sys.path.insert(0, os.path.abspath("python"))
from jit_api import JITEngine

app = FastAPI(title="JIT FastAPI Demo Server")

# 1. 初始化 JIT 引擎 (穩定度門檻 = 3)
engine = JITEngine(
    stability_threshold=3,
    confidence_threshold=0.85,
    on_freeze=lambda codegen: print(
        f"\n❄️  [FREEZE] 路由 '{codegen['schema'].route}' 已自動凍結！\n"
        f"   - Python (Pydantic): {codegen['files']['python']}\n"
        f"   - TypeScript (Zod): {codegen['files']['typescript']}\n"
    ),
    on_drift=lambda route, err: print(
        f"\n⚠️  [DRIFT] 路由 '{route}' 欄位漂移: {err}，已自動降級回 Phase 1 並開啟 v2 觀測。\n"
    ),
)


# 2. 宣告結帳端點
@engine.route(
    name="create_order",
    description="處理使用者下單與訂單成立",
    intent="User wants to buy, purchase, checkout or order items and products",
    enum_fields={
        "paymentMethod": {
            "CREDIT_CARD": "信用卡付款",
            "LINE_PAY": "Line Pay 行動支付",
            "APPLE_PAY": "Apple Pay 行動支付",
        }
    },
)
async def handle_create_order(payload: dict, ctx):
    try:
        amt = float(payload.get("amount", 0))
    except (ValueError, TypeError):
        amt = 0.0

    return {
        "order_id": "ORD-" + str(abs(hash(payload.get("item", ""))) % 900000 + 100000),
        "status": "CONFIRMED",
        "item": payload.get("item", "預設商品"),
        "amount": amt,
        "payment_method": payload.get("paymentMethod", "CREDIT_CARD"),
        "phase": ctx.phase,
        "ai_latency_ms": ctx.ai_latency_ms,
        "engine_used": ctx.engine_used,
    }


# 3. 動態 JIT 進入點
@app.post("/api/jit")
async def jit_entrypoint(request: Request):
    try:
        body = await request.json()
        result = await engine.execute(body)
        return {
            "success": result.success,
            "data": result.data,
            "context": {
                "route": result.context.route,
                "phase": result.context.phase,
                "ai_latency_ms": result.context.ai_latency_ms,
                "engine_used": result.context.engine_used,
                "is_fallback": result.context.is_fallback,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# 4. 路由狀態查詢入口
@app.get("/api/jit/status/{route}")
async def get_route_status(route: str):
    return engine.get_route_status(route)


if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 8085))
    print("=" * 70)
    print(f"🚀 JIT FastAPI Server 啟動於 http://127.0.0.1:{PORT}")
    print(f"   - POST http://127.0.0.1:{PORT}/api/jit (動態進入點)")
    print(f"   - GET  http://127.0.0.1:{PORT}/api/jit/status/create_order (狀態查詢)")
    print("=" * 70)
    uvicorn.run(app, host="127.0.0.1", port=PORT)
