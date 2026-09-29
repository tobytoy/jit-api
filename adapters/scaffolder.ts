/**
 * JIT Protocol Synthesis Framework - Project Scaffolder
 * 
 * Generates ready-to-deploy boilerplates and presets for:
 * - line-liff: LINE Mini App (LIFF) Frontend + JIT Specs
 * - cloudflare: Cloudflare Workers edge deployment
 * - firebase: Firebase Functions v2 Serverless deployment
 * - supabase: Supabase Auth & Postgres Storage integration
 */

import fs from 'fs';
import path from 'path';

export type ScaffoldPreset = 'line-liff' | 'cloudflare' | 'firebase' | 'supabase' | 'line-relay';

export interface ScaffoldOptions {
  preset: ScaffoldPreset;
  outDir?: string;
  projectName?: string;
  liffId?: string;
  channelId?: string;
}

export class ProjectScaffolder {
  public static async scaffold(options: ScaffoldOptions): Promise<{ outDir: string; files: string[] }> {
    const cwd = process.cwd();
    const outDir = path.resolve(cwd, options.outDir || `./jit-${options.preset}-app`);
    const projectName = options.projectName || path.basename(outDir);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const files: string[] = [];

    function writeFile(relPath: string, content: string) {
      const fullPath = path.join(outDir, relPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content.trim() + '\n', 'utf-8');
      files.push(fullPath);
    }

    if (options.preset === 'line-liff') {
      // 1. LINE Mini App (LIFF)
      writeFile(
        'public/index.html',
        `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${projectName} - LINE Mini App</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    :root {
      --line-green: #06C755;
      --bg-dark: #12141a;
      --card-bg: #1c202a;
      --text: #f0f2f5;
      --text-dim: #9aa0a6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg-dark); color: var(--text); padding: 1.5rem; display: flex; flex-direction: column; min-height: 100vh; }
    .card { background: var(--card-bg); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.2rem; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .user-profile { display: flex; align-items: center; gap: 1rem; }
    .avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid var(--line-green); }
    .btn { background: var(--line-green); color: #fff; border: none; border-radius: 12px; padding: 1rem; width: 100%; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 0.1s; }
    .btn:active { transform: scale(0.98); }
    pre { background: #0a0b0e; padding: 1rem; border-radius: 8px; font-size: 0.85rem; color: #a5d6a7; overflow-x: auto; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="user-profile">
      <img id="userAvatar" class="avatar" src="https://placehold.co/100x100/06C755/white?text=LINE" alt="Avatar">
      <div>
        <h2 id="userName">載入中...</h2>
        <p id="userId" style="color: var(--text-dim); font-size: 0.8rem;">LIFF ID: ${options.liffId || 'YOUR-LIFF-ID'}</p>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>🎁 會員積分專區 (JIT API 連線)</h3>
    <p style="color: var(--text-dim); font-size: 0.85rem; margin: 0.5rem 0 1rem;">透過 LINE ID Token 鑑權調用 JIT 後端動態端點。</p>
    <button id="btnFetchPoints" class="btn">查詢我的會員積分</button>
    <pre id="resultBox">// 點擊按鈕調用 JIT API...</pre>
  </div>

  <script src="./liff-app.js"></script>
</body>
</html>`
      );

      writeFile(
        'public/liff-app.js',
        `// LINE LIFF + JIT API Client
const LIFF_ID = "${options.liffId || 'YOUR-LIFF-ID'}";
const API_BASE = window.location.origin.includes('github.io') ? 'https://your-jit-backend.onrender.com' : '';

async function initLiff() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    const profile = await liff.getProfile();
    document.getElementById('userName').textContent = profile.displayName;
    document.getElementById('userAvatar').src = profile.pictureUrl;
    document.getElementById('userId').textContent = 'ID: ' + profile.userId;
  } catch (err) {
    document.getElementById('userName').textContent = '訪客模式 (開發預覽)';
    console.warn('LIFF init fallback:', err);
  }
}

document.getElementById('btnFetchPoints').addEventListener('click', async () => {
  const resultBox = document.getElementById('resultBox');
  resultBox.textContent = '呼叫中...';

  try {
    let idToken = '';
    try {
      idToken = liff.getIDToken();
    } catch {}

    const res = await fetch(\`\${API_BASE}/api/jit/member_points\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': idToken ? \`Bearer \${idToken}\` : 'Bearer mock_line_U123456789'
      },
      body: JSON.stringify({ action: 'query' })
    });

    const data = await res.json();
    resultBox.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    resultBox.textContent = '呼叫失敗: ' + err.message;
  }
});

initLiff();`
      );

      writeFile(
        'specs/member_points.api.md',
        `# 會員積分查詢與折抵 API

## Intent
查詢 LINE 會員的累積積分、會員等級與近期折抵紀錄。

## Auth
- type: line
- provider: line

## Fields
- action: string, required (query, history)

## Logic
\`\`\`javascript
const userId = context.user ? context.user.id : 'U_DEFAULT';
return {
  userId,
  tier: 'VIP Gold',
  points: 1250,
  expiringPoints: 150,
  expiryDate: '2026-12-31'
};
\`\`\`

## Mock
\`\`\`json
{
  "userId": "U123456789",
  "tier": "VIP Gold",
  "points": 1250,
  "expiringPoints": 150,
  "expiryDate": "2026-12-31"
}
\`\`\`

## Sample
\`\`\`json
{ "action": "query" }
\`\`\`
`
      );

      writeFile(
        'README.md',
        `# ${projectName} - LINE Mini App (LIFF) + JIT Protocol

這個專案是一套開箱即用的 LINE Mini App 與 JIT API 應用骨架：

## 🚀 部署教學

### 1. 前端靜態部署 (GitHub Pages / Cloudflare Pages)
* 將 \`public/\` 目錄直接部署至 GitHub Pages 或 Cloudflare Pages（免費、自帶 HTTPS，完美相容 LINE 要求）。
* 指令：\`npx jit-api export pages --out dist-pages\`

### 2. 後端 JIT API 部署
* 使用 Docker 或 Render / Railway 執行：\`npx jit-api start --port 3000\`
* 或在本地以開發模式測試：\`npx jit-api dev\`

### 3. 在 LINE Developers Console 設定 LIFF
* 建立 LINE Login Channel，新增 LIFF App。
* Endpoint URL 填入你的 GitHub Pages 或 Cloudflare Pages 網址。
`
      );
    } else if (options.preset === 'cloudflare') {
      // 2. Cloudflare Workers
      writeFile(
        'wrangler.toml',
        `name = "${projectName}"
main = "src/worker.ts"
compatibility_date = "2026-09-01"

[vars]
ENVIRONMENT = "production"
`
      );

      writeFile(
        'src/worker.ts',
        `import { createCloudflareHandler } from 'jit-api/adapters';

const handler = createCloudflareHandler({
  corsOrigin: '*',
  mocks: {
    hello: { message: 'Hello from JIT Cloudflare Edge!' }
  }
});

export default handler;`
      );

      writeFile(
        'package.json',
        JSON.stringify(
          {
            name: projectName,
            version: '1.0.0',
            type: 'module',
            scripts: {
              dev: 'wrangler dev',
              deploy: 'wrangler deploy',
            },
            dependencies: {
              'jit-api': '^1.4.1',
            },
            devDependencies: {
              wrangler: '^3.80.0',
            },
          },
          null,
          2
        )
      );
    } else if (options.preset === 'firebase') {
      // 3. Firebase Functions
      writeFile(
        'firebase.json',
        JSON.stringify(
          {
            functions: {
              source: 'functions',
              runtime: 'nodejs20',
            },
          },
          null,
          2
        )
      );

      writeFile(
        'functions/package.json',
        JSON.stringify(
          {
            name: `${projectName}-functions`,
            version: '1.0.0',
            type: 'module',
            main: 'index.js',
            dependencies: {
              'firebase-functions': '^6.0.0',
              'jit-api': '^1.4.1',
              express: '^4.21.2',
            },
          },
          null,
          2
        )
      );

      writeFile(
        'functions/index.js',
        `import { onRequest } from 'firebase-functions/v2/https';
import { createFirebaseHandler } from 'jit-api/adapters';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', platform: 'firebase' }));

export const api = onRequest({ cors: true }, createFirebaseHandler(app));`
      );
    } else if (options.preset === 'supabase') {
      // 4. Supabase Integration
      writeFile(
        'supabase/schema.sql',
        `-- JIT Protocol Synthesis - Supabase Persistence Tables

CREATE TABLE IF NOT EXISTS public.jit_kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.jit_tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'IN_REVIEW',
  collaborator TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.jit_kv_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jit_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON public.jit_kv_store
  FOR ALL USING (auth.role() = 'service_role');
`
      );

      writeFile(
        '.env.example',
        `SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
JWT_SECRET=your-supabase-jwt-secret
`
      );

      writeFile(
        'jit.config.js',
        `import { createSupabaseAuthPlugin, SupabaseStorageAdapter } from 'jit-api/plugins';

export default {
  plugins: [
    createSupabaseAuthPlugin({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    })
  ],
  storage: new SupabaseStorageAdapter({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_KEY || '',
  })
};`
      );
    } else if (options.preset === 'line-relay') {
      // 5. LINE Message Relay Bot (Smart Forwarder to Person C)
      writeFile(
        'specs/relay_condition.api.md',
        `# LINE 訊息智慧分流與轉發 API

## Intent
判斷使用者 (B1, B2, B3) 傳送的對話內容是否符合「緊急障礙報修」、「大額商機諮詢」或「指名聯繫主管 C」，並決定是否轉發給主管 C。

## Fields
- senderId: string, required (LINE 使用者 ID)
- text: string, required (對話文字內容)
- amount: number (若有詢價或報價金額)

## Logic
\`\`\`javascript
const isUrgent = /緊急|當機|報修|無法登入|立刻|客訴|找經理|找主管|退費/i.test(payload.text);
const isHighValue = Number(payload.amount || 0) >= 50000;
const shouldRelay = isUrgent || isHighValue;

return {
  status: 'PROCESSED',
  senderId: payload.senderId,
  text: payload.text,
  shouldRelay,
  urgency: isUrgent ? 'HIGH' : 'NORMAL'
};
\`\`\`

## Notify
- channel: line
- target: env.TARGET_C_USER_ID
- condition: shouldRelay == true
- template: "🚨 收到來自 {senderId} 的緊急/大額轉發訊息：\\n{text}"
- tokenEnv: LINE_CHANNEL_ACCESS_TOKEN

## Sample
\`\`\`json
{
  "senderId": "U_USER_B1",
  "text": "系統無法登入，有大客戶在線等，緊急求助！",
  "amount": 0
}
\`\`\`
`
      );

      writeFile(
        '.env.example',
        `# LINE Messaging API 憑證 (取自 LINE Developers Console)
LINE_CHANNEL_SECRET=your_line_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token_here

# 接收轉發訊息的目標主管/客服 C 的 LINE User ID (格式: Uxxxxxxxx...)
TARGET_C_USER_ID=U1234567890abcdef1234567890abcdef
`
      );

      writeFile(
        'src/worker.ts',
        `import { verifyLineSignature } from 'jit-api/plugins';
import { JITEngine, MDLoader } from 'jit-api';

const engine = new JITEngine();
const loader = new MDLoader('./specs');
await loader.loadAll(engine);

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    if (req.method === 'GET') {
      return new Response('JIT LINE Relay Bot is running! 🚀', { status: 200 });
    }

    const signature = req.headers.get('x-line-signature') || '';
    const rawBody = await req.text();
    const channelSecret = env.LINE_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || '';

    // 1. 安全簽章驗證 (HMAC-SHA256)
    if (!verifyLineSignature(rawBody, signature, channelSecret)) {
      return new Response('Unauthorized: Invalid LINE signature', { status: 401 });
    }

    // 2. 處理 LINE Webhook Events
    try {
      const { events } = JSON.parse(rawBody);
      for (const event of events || []) {
        if (event.type === 'message' && event.message.type === 'text') {
          const senderId = event.source.userId;
          const text = event.message.text;

          // 3. 呼叫 JIT-API 執行語意判斷與宣告式轉發 (## Notify 自動發送給 C)
          await engine.execute(
            { senderId, text },
            'relay_condition'
          );
        }
      }
    } catch (err: any) {
      console.error('[Relay Error]', err);
    }

    return new Response('OK', { status: 200 });
  }
};`
      );

      writeFile(
        'wrangler.toml',
        `name = "${projectName}"
main = "src/worker.ts"
compatibility_date = "2026-09-01"

[vars]
# 請在 Cloudflare Dashboard Secrets 設定:
# LINE_CHANNEL_SECRET = "..."
# LINE_CHANNEL_ACCESS_TOKEN = "..."
# TARGET_C_USER_ID = "..."
`
      );

      writeFile(
        'package.json',
        JSON.stringify(
          {
            name: projectName,
            version: '1.0.0',
            type: 'module',
            scripts: {
              dev: 'wrangler dev',
              deploy: 'wrangler deploy',
            },
            dependencies: {
              'jit-api': '^1.4.1',
            },
            devDependencies: {
              wrangler: '^3.80.0',
            },
          },
          null,
          2
        )
      );

      writeFile(
        'README.md',
        `# ${projectName} - JIT LINE 智慧訊息轉發機器人

這個專案使用 JIT-API 的「宣告式轉發 (## Notify)」架構，實現 $B_1, B_2, B_3$ 與機器人對話時，自動辨識語意並在滿足條件時主動轉發訊息給指定主管/客服 $C$。

## 🔑 環境變數設定 (.env)
請複製 \`.env.example\` 為 \`.env\` 並填入：
* \`LINE_CHANNEL_SECRET\`：LINE Messaging API 的 Channel Secret
* \`LINE_CHANNEL_ACCESS_TOKEN\`：LINE Messaging API 的 Channel Access Token (Long-lived)
* \`TARGET_C_USER_ID\`：接收轉發通知的對象 C 之 LINE User ID

## 🚀 部署至 Cloudflare Workers
\`\`\`bash
npm install
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put TARGET_C_USER_ID
npm run deploy
\`\`\`
將 Cloudflare 產生的網址填入 LINE Developers Console 的 Webhook URL 即可！
`
      );
    }

    return { outDir, files };
  }
}
