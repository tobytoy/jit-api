# JIT LINE 智慧訊息轉發與條件推播指南 (Message Relay Bot)

> **場景架構**：$A$ 打造了一隻 LINE 官方帳號機器人，多位使用者（$B_1, B_2, B_3$）在聊天室與 Bot 對話，JIT-API 在背景自動辨識語意與判斷條件，一旦觸發特定事件（如：緊急客訴、重大障礙、大額詢價），Bot 會立即主動將訊息或摘要轉發推播給負責主管/專員 $C$。

---

## 📐 1. 架構拓撲與部署平台選擇

```text
[使用者 B1, B2, B3] 
        │ (傳送文字 / 語音 / 圖片)
        ▼
   [LINE App] 
        │ (LINE Webhook HTTPS POST)
        ▼
┌────────────────────────────────────────────────────────┐
│  Cloudflare Workers 或 Node.js 伺服器                   │
│                                                        │
│  1. 簽章驗證 (HMAC-SHA256 驗證 x-line-signature)        │
│  2. JIT-API 引擎 (執行 specs/relay_condition.api.md)   │
│     ├── Phase 1: 語意理解 (TypeSafe Jev / Needle)       │
│     ├── Phase 3: 靜態快路 (0ms, 0 Token 費用)           │
│     └── 宣告式轉發 (## Notify 條件命中)                 │
└───────────────────────┬────────────────────────────────┘
                        │ (LINE Messaging API Push Message)
                        ▼
                 [負責主管 / 客服 C]
```

### 部署平台評估：放在哪裡最合適？

| 平台 | 適用性 | 優點 | 缺點 / 注意事項 |
| :--- | :---: | :--- | :--- |
| **GitHub Pages** | ❌ **不適用** | 免費、自帶網址 | **只能放純靜態 HTML/JS**，無法接收 LINE 伺服器的 `POST` Webhook。*(適合放 LIFF 前端，不適合作為 Bot 後端)* |
| **Cloudflare Workers** | 🌟 **第一首選** | **0ms 極速冷啟動**、全球邊緣 PoP、每天 100,000 次請求免費、自帶免費 HTTPS。 | 程式碼大小限制於 1MB 內（JIT Edge 轉接器已做輕量化優化）。 |
| **Firebase Functions** | ⚡ **次選推薦** | 原生 Node.js 環境、自帶 Firestore 儲存對話紀錄。 | 免費層（Spark）需綁信用卡開通 Blaze 隨用隨付；久未呼叫時有 1~3 秒冷啟動延遲。 |
| **Render / Railway / VPS** | 🚀 **全功能推薦** | 完整 Docker / Node.js 環境，可同時啟用 Web Studio 視覺儀表板。 | 免費方案有休眠機制，正式營運建議付費（約 $5/月）保持常駐。 |

---

## 🔑 2. 環境變數清單：哪些資訊必須寫入 `.env`？

開發這類轉發 Bot 時，**機密金鑰絕對不能寫死在程式碼或 Git 倉庫中**，必須統一透過 `.env`（本地開發）或雲端環境變數（Production）注入：

### 必備的 `.env` 變數對照表

```env
# ==============================================================================
# 1. LINE Messaging API 安全憑證
# ==============================================================================

# LINE Channel Secret (密鑰)
# 【取得位置】：LINE Developers Console -> 選擇你的 Channel -> Basic settings -> Channel secret
# 【核心用途】：用來對每一筆收到的 Webhook 請求進行 HMAC-SHA256 驗簽，防止駭客偽造假訊息打爆你的伺服器。
LINE_CHANNEL_SECRET=8f4a1234567890abcdef1234567890ab

# LINE Channel Access Token (長期存取權杖)
# 【取得位置】：LINE Developers Console -> 選擇你的 Channel -> Messaging API -> Channel access token (long-lived) -> Issue
# 【核心用途】：當條件滿足時，呼叫 LINE Messaging API 的 POST /v2/bot/message/push 發送推播訊息給 C。
LINE_CHANNEL_ACCESS_TOKEN=your_very_long_channel_access_token_here_xxxxxxxxx==

# ==============================================================================
# 2. 轉發目標對象與業務設定
# ==============================================================================

# 目標對象 C 的 LINE User ID
# 【注意陷阱】：這「不是」使用者的 LINE ID（如 toby123），而是 LINE 系統為該帳號分配的「U 開頭 33 碼 UUID」！
# 【取得方式】：
#   方法 A：讓 C 加入 Bot 好友並傳任一訊息，在伺服器 log 印出 event.source.userId。
#   方法 B：在 LINE Developers Console 的「Your user ID」查看自己的 ID。
TARGET_C_USER_ID=U1234567890abcdef1234567890abcdef

# (可選) 觸發轉發的金額門檻 (單位: 新台幣/美元)
RELAY_THRESHOLD_AMOUNT=50000
```

> ⚠️ **安全警告**：
> 1. 請務必確認 `.gitignore` 包含 `.env`，防止 Token 外洩。
> 2. 若部署到 **Cloudflare Workers**，請使用 `wrangler secret put LINE_CHANNEL_ACCESS_TOKEN` 指令加密寫入。

---

## 📝 3. JIT-API 宣告式轉發規格（`## Notify`）

使用 JIT-API，你不需要在程式碼裡寫一長串繁瑣的 `if (msg.includes(...)) { axios.post(...) }`，直接在 Markdown 裡宣告：

```markdown
# specs/relay_condition.api.md

# LINE 訊息智慧分流與轉發 API
Version: 1.0.0
Stage: prod

## Intent
判斷使用者 (B1, B2, B3) 傳送的文字是否符合「緊急故障回報」、「重大客訴投訴」、「指定主管處理」或「大額詢價」等需要升級處置的事件。

## Fields
- senderId: string, required (發送者的 LINE 使用者 ID)
- text: string, required (發送的對話內容)
- amount: number (涉及的訂單或報價金額)

## Logic
```javascript
// 1. 關鍵詞與語意混合判定
const isUrgent = /緊急|當機|故障|無法登入|立刻|客訴|找經理|找主管|退費|報警/i.test(payload.text);
const isHighValue = Number(payload.amount || 0) >= (Number(process.env.RELAY_THRESHOLD_AMOUNT) || 50000);

// 2. 決定是否升級轉發
const shouldRelay = isUrgent || isHighValue;

return {
  status: 'PROCESSED',
  senderId: payload.senderId,
  text: payload.text,
  shouldRelay,
  urgency: isUrgent ? 'HIGH' : 'NORMAL'
};
```

## Notify
- channel: line
- target: env.TARGET_C_USER_ID
- condition: shouldRelay == true
- template: "🚨 【JIT 警報轉發】收到來自 {senderId} 的緊急通報：\n\n「{text}」\n\n請主管儘速至系統處理！"
- tokenEnv: LINE_CHANNEL_ACCESS_TOKEN

## Sample
```json
{
  "senderId": "U_USER_B1",
  "text": "我們公司的 POS 系統全線當機，結帳完全卡死，請立刻找經理！",
  "amount": 0
}
```
```

---

## ⚡ 4. 一鍵產生專案骨架（Scaffold）

JIT-API 提供了專屬的腳手架指令，一行指令即可建立包含 Webhook 驗簽、宣告式轉發與 Cloudflare Worker 配置的完整專案：

```bash
# 在終端機執行
npx jit-api scaffold line-relay --out my-line-bot
```

### 產出的目錄結構：
```text
my-line-bot/
├── specs/
│   └── relay_condition.api.md  # 宣告式轉發規格書
├── src/
│   └── worker.ts               # Cloudflare / Node 進入點 (含 Webhook 簽章驗證)
├── wrangler.toml               # Cloudflare Workers 配置檔
├── .env.example                # 環境變數範本
├── package.json
└── README.md                   # 部署指引
```

---

## 🚀 5. 本地測試與上線部署

### 步驟 A：本地測試 (使用 ngrok 或 Cloudflare Tunnel)
1. 複製環境變數：
   ```bash
   cp .env.example .env
   # 編輯 .env 填入 LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, TARGET_C_USER_ID
   ```
2. 啟動本機伺服器：
   ```bash
   npm run dev
   ```
3. 暴露本機 Port（例如使用 Cloudflare Tunnel 或 ngrok）：
   ```bash
   npx cloudflared tunnel --url http://localhost:8787
   ```
4. 將產生的 `https://xxxx.trycloudflare.com` 貼到 LINE Developers 的 **Webhook URL** 並開啟 **Use Webhook**。

### 步驟 B：正式部署至 Cloudflare Workers
1. 上傳機密環境變數至 Cloudflare：
   ```bash
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put TARGET_C_USER_ID
   ```
2. 發布上線：
   ```bash
   npm run deploy
   ```
3. 將發布後取得的 Workers 網址（例如 `https://my-line-bot.your-subdomain.workers.dev`）填入 LINE Developers Console。

---

## 💡 6. 為什麼 JIT-API 的方案大幅超越傳統寫法？

1. **零 AI 費用結晶 (Phase 1 -> Phase 3)**：
   若大量使用者 $B_1, B_2, B_3$ 重複發送類似的故障回報句型，JIT 引擎在數次請求後會自動將其**編譯固化為 0ms 靜態快路**，此後相同的語意判斷**完全不消耗大模型 Token 費用**！
2. **規格熱重載**：
   未來主管 $C$ 想要新增過濾條件（例如「金額改成 30,000 以上也要轉發」），**只需修改 Markdown 檔案**，JIT 引擎自動熱重載生效，完全不用修改程式碼或重寫部署管線。
3. **多管道彈性**：
   `## Notify` 除了支援 `channel: line`，未來還可無縫切換或擴充 `channel: webhook`、`channel: slack`、`channel: discord`，一行 Markdown 即可對接不同通知中樞！
