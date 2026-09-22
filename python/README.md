# JIT Protocol Synthesis Framework - Python Engine (`jit-api-python`)

> **基於 TypeSafe (Jev) 與 Cactus Needle 3.0 的原生 Python 動態至靜態 API 合成引擎**  
> *Pythonic Native Host Engine for Just-In-Time Protocol Synthesis*

---

## 🌟 特色

1. **同進程 Cactus Needle 3.0 端側推論**：
   在無 `TYPESAFE_API_KEY` 或離線狀態下，直接調用進程內的 Needle 3 SAN (2-bit, 35MB) 進行毫秒級 Tool Calling 與結構萃取，**0 網路轉發延遲、0 API 費用**。
2. **極致優雅的裝飾器語法**：
   使用 `@engine.route(...)` 宣告語意意圖，無縫支援 `async def` 與同步 `def` 函式。
3. **Pydantic v2 動態模型極速路徑**：
   當路由結構在過去 N 次請求中穩定後，自動生成動態 Pydantic v2 BaseModel，Phase 3 靜態驗證僅需 **0.03ms (0ms AI 延遲)**！
4. **自動版本演進與降級保護**：
   若遇到型態漂移（Schema Drift），自動降級回 Phase 1 並開啟 v2 / v3 版本的觀測與合約重新凍結。
5. **多語言程式碼生成積木**：
   凍結時同步輸出 TypeScript (Zod)、Golang (.proto / struct) 與 Python (Pydantic / FastAPI)。

---

## 🚀 快速上手 (Quick Start)

### 執行環境 (Conda `toby`)
```bash
conda activate toby
```

### 宣告端點與執行
```python
import asyncio
from jit_api import JITEngine

engine = JITEngine(stability_threshold=3)

@engine.route(
    name="create_invoice",
    description="Issue a customer billing invoice",
    intent="Bill or invoice a customer for items",
    enum_fields={"currency": {"USD": "US Dollar", "EUR": "Euro"}}
)
async def create_invoice(payload, ctx):
    return {
        "invoice_id": "INV-100",
        "customer": payload.get("customer"),
        "amount": payload.get("amount"),
        "phase": ctx.phase,
    }

async def main():
    # 支援自然語言或鬆散 JSON
    res = await engine.execute({
        "message": "Please bill Wayne Corp for 500 dollars urgently",
        "customer": "Wayne Corp",
        "amount": 500,
        "currency": "USD"
    })
    print(res.data)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 🧪 執行測試與演示

```bash
# 執行全套 pytest 測試
PYTHONPATH=python /home/toby/miniconda3/envs/toby/bin/pytest python/tests/ -v

# 執行端到端生命週期演示
PYTHONPATH=python /home/toby/miniconda3/envs/toby/bin/python python/examples/demo_lifecycle.py
```
