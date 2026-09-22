#!/usr/bin/env python3
"""
JIT Protocol Synthesis - Python Client Test Script

Demonstrates how client interacts with JIT Server across:
  Phase 1 (Dynamic) ➔ Phase 2 (Observing) ➔ Phase 3 (Fast-Path) ➔ Schema Drift Fallback

Run with:
  /home/toby/miniconda3/envs/toby/bin/python docs/examples/py_client.py
"""

import json
import os
import time
import requests

PORT = os.environ.get("PORT", "8085")
SERVER_URL = f"http://127.0.0.1:{PORT}/api/jit"


def send_request(label: str, payload: dict):
    print(f"\n📤 [{label}] 發送請求: {json.dumps(payload, ensure_ascii=False)}")
    start_time = time.time()

    try:
        resp = requests.post(SERVER_URL, json=payload, timeout=10)
        total_time = round((time.time() - start_time) * 1000, 2)

        if not resp.ok:
            print(f"❌ 請求失敗 ({resp.status_code}): {resp.text}")
            return

        body = resp.json()
        ctx = body.get("context", {})
        print(f"📥 伺服器響應 (耗時 {total_time}ms):")
        print(f"   - 命中路由: [{ctx.get('route')}]")
        print(f"   - 處於階段: [{ctx.get('phase')}]")
        print(f"   - AI 耗時:  {ctx.get('ai_latency_ms')}ms")
        print(f"   - 是否回退: {ctx.get('is_fallback', False)}")
        print(f"   - 回傳資料: {body.get('data')}")
    except requests.exceptions.ConnectionError:
        print(f"❌ 連線失敗: 請確認伺服器已在 {SERVER_URL} 啟動！")


def main():
    print("=" * 70)
    print("📱 JIT Python Client 全生命週期調用展示")
    print("=" * 70)

    # 1. Phase 1: 鬆散非結構化請求 (自然語言)
    send_request(
        "階段 1: Phase 1 語意熱啟動 (鬆散輸入)",
        {
            "message": "我要買一台 Sony 相機，刷信用卡，金額是 42000 元",
            "item": "Sony Alpha 7",
            "amount": 42000,
        },
    )

    # 2. Phase 2: 連續發送格式一致的請求，使伺服器觀察穩定度並觸發凍結
    print("\n--- 連續發送 3 次一致請求以觸發凍結 ---")
    for i in range(1, 4):
        send_request(
            f"階段 2: 穩定請求 #{i}",
            {
                "route": "create_order",
                "item": f"周邊配件-{i}",
                "amount": 800 * i,
                "paymentMethod": "LINE_PAY",
            },
        )

    # 3. Phase 3: 傳統極速期 (0 毫秒 AI 延遲，極速響應)
    send_request(
        "階段 3: Phase 3 極速路徑 (已凍結)",
        {
            "route": "create_order",
            "item": "高傳真降噪耳機",
            "amount": 12000,
            "paymentMethod": "APPLE_PAY",
        },
    )

    # 4. Schema Drift: 業務需求突發變更 (傳入新型態與新欄位)
    send_request(
        "階段 4: Schema Drift 突發變更 (自主演進)",
        {
            "route": "create_order",
            "item": "限量版黑膠唱片機",
            "amount": "NOT_A_FLOAT",  # 故意傳入字串違反原本的數值型態
            "couponCode": "VIP_DISCOUNT",  # 🌟 新增的未定義欄位
            "paymentMethod": "CREDIT_CARD",
        },
    )

    print("\n" + "=" * 70)
    print("🎉 Python Client 調用示範完成！")
    print("=" * 70)


if __name__ == "__main__":
    main()
