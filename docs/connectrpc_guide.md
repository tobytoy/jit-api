# ConnectRPC 整合與呼叫指南 (ConnectRPC Integration Guide)

JIT-API 支援由 Buf 主導開發的現代化 **ConnectRPC** 協定。在維持原有的 REST Gateway (`/api/jit`) 與 MCP (`/sse`) 的同時，額外提供兼具 **高效能二進位**、**強型別契約** 與 **瀏覽器直連** 的 RPC 介面。

---

## 什麼是 ConnectRPC？

ConnectRPC 是一種現代化 RPC 協定家族，其伺服器端天然具備 **「三重協定（Triple-Protocol）」** 支援能力：

1. **Connect 協定**：基於 HTTP POST + JSON 或 Protobuf 二進位，相容於標準 HTTP/1.1 與 HTTP/2。
2. **gRPC-Web 協定**：支援瀏覽器端直連，**不需要** 透過 Envoy Proxy 轉譯。
3. **標準 gRPC 協定**：與跨語言 gRPC 工具（如 Go、Python、Java）原生相容。

---

## ConnectRPC 服務結構

在 JIT-API 中，預設掛載的服務名稱為 **`jit.v1.JITService`**：

| 端點 | 方法 | 說明 |
| :--- | :---: | :--- |
| `GET /jit.v1.JITService` | GET | 服務反射與詮釋資料（取得所有可用 RPC 方法、當前 Phase 狀態） |
| `POST /jit.v1.JITService/Execute` | POST | 通用 JIT 執行入口（支援自然語言 Intent 辨識與動態路由） |
| `POST /jit.v1.JITService/:Method` | POST | 針對特定 API 的具名 RPC（例如 `/jit.v1.JITService/CreateOrder`） |

---

## 呼叫範例

### 1. 使用 `curl` 呼叫 (Connect Protocol)

#### (1) 通用執行入口 (`/Execute`)
```bash
curl -X POST http://localhost:3005/jit.v1.JITService/Execute \
  -H "Content-Type: application/json" \
  -H "Connect-Protocol-Version: 1" \
  -d '{
    "route": "create_order",
    "payload": {
      "item": "MacBook Pro M4 Max",
      "amount": 89000,
      "paymentMethod": "CREDIT_CARD"
    }
  }'
```

#### (2) 具名 RPC 入口 (`/CreateOrder`)
```bash
curl -X POST http://localhost:3005/jit.v1.JITService/CreateOrder \
  -H "Content-Type: application/json" \
  -H "Connect-Protocol-Version: 1" \
  -d '{
    "item": "MacBook Pro M4 Max",
    "amount": 89000,
    "paymentMethod": "CREDIT_CARD"
  }'
```

---

### 2. Go 客戶端呼叫 (`connect-go`)

在 Go 專案中使用 `connectrpc.com/connect`：

```go
package main

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
)

type OrderRequest struct {
    Item          string  `json:"item"`
    Amount        float64 `json:"amount"`
    PaymentMethod string  `json:"paymentMethod"`
}

func main() {
    client := &http.Client{}
    payload, _ := json.Marshal(OrderRequest{
        Item:          "Go Gopher Plush",
        Amount:        1200,
        PaymentMethod: "CREDIT_CARD",
    })

    req, _ := http.NewRequestWithContext(
        context.Background(),
        "POST",
        "http://localhost:3005/jit.v1.JITService/CreateOrder",
        bytes.NewBuffer(payload),
    )
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Connect-Protocol-Version", "1")

    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    fmt.Println("ConnectRPC Response Status:", resp.Status)
}
```

---

### 3. Python 客戶端呼叫 (`requests` / `httpx`)

Python 端可使用標準 HTTP 客戶端直接以 Connect Protocol 調用：

```python
import requests

url = "http://localhost:3005/jit.v1.JITService/CreateOrder"
headers = {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
}
payload = {
    "item": "RTX 5090 GPU",
    "amount": 65000,
    "paymentMethod": "APPLE_PAY",
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

print(f"Status: {response.status_code}")
print(f"Result: {data}")
print(f"Phase: {data.get('_jit', {}).get('phase')}")
```

---

### 4. TypeScript / 瀏覽器端調用 (`fetch` / `@connectrpc/connect-web`)

在瀏覽器前端或 Node.js 中：

```typescript
const response = await fetch('http://localhost:3005/jit.v1.JITService/CreateOrder', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
  },
  body: JSON.stringify({
    item: 'Studio Display',
    amount: 45000,
    paymentMethod: 'APPLE_PAY',
  }),
});

const result = await response.json();
console.log('Order ID:', result.order_id);
console.log('Execution Phase:', result._jit?.phase);
```

---

## Phase 3 靜態凍結與 Schema Drift

* **0ms AI Latency**：當某支 API 連續調用次數達到 `stabilityThreshold` 門檻時，路由將自動進入 Phase 3 凍結。此時透過 ConnectRPC 發起的請求，會直接經過記憶體高速 Zod 驗證器執行，AI 延遲降為 **0ms**。
* **變異自動降級 (Drift Fallback)**：若呼叫端傳送了型別不相符的欄位，JIT 引擎會立即偵測到 Schema Drift，自動觸發降級機制退回 Phase 1，並交由 LLM 或 Needle 進行智慧相容處理，兼具極致效能與高度彈性！
