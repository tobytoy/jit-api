#!/usr/bin/env node

/**
 * JIT Protocol Synthesis CLI
 * 
 * Usage:
 *   npx jit-api [dev] [--port 3005] [--specs ./specs]
 *   npx jit-api init
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

// Dynamic import core modules (supports both compiled dist and source)
let coreModules;
try {
  coreModules = await import('../dist/core/index.js');
} catch {
  coreModules = await import('../core/index.js');
}

const { JITEngine, MDLoader, BenchmarkRunner, MCPAdapter, TerminalServer } = coreModules;

const args = process.argv.slice(2);
const command = args[0] || 'dev';

// Parse CLI flags
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultVal;
}

if (args.includes('--help') || args.includes('-h') || command === 'help') {
  console.log(`
⚡ JIT Protocol Synthesis CLI (jit-api)

Usage:
  npx jit-api [command] [options]

Commands:
  dev               啟動 JIT 協定合成伺服器與 Web 控制台 (預設)
  init              在當前專案目錄建立 specs/ 規格目錄與範本

Options:
  --port <number>   指定伺服器連接埠 (預設: 3005)
  --specs <path>    指定 Markdown API 規格目錄 (預設: ./specs)
  -h, --help        顯示說明資訊
  -v, --version     顯示版本資訊
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
  console.log(`jit-api v${pkg.version}`);
  process.exit(0);
}

if (command === 'init') {
  const targetSpecsDir = path.resolve(process.cwd(), getArg('--specs', 'specs'));
  if (!fs.existsSync(targetSpecsDir)) {
    fs.mkdirSync(targetSpecsDir, { recursive: true });
  }

  const sampleFile = path.join(targetSpecsDir, 'order.api.md');
  if (!fs.existsSync(sampleFile)) {
    fs.writeFileSync(
      sampleFile,
      `# API: create_order
> 處理使用者下單與訂單成立

## Intent
User wants to buy, purchase, checkout or order items and products

## Fields
- item: string (商品名稱)
- amount: number (訂單金額)
- paymentMethod: enum (付款方式)
  - CREDIT_CARD: 信用卡線上刷卡
  - LINE_PAY: Line Pay 行動支付
  - APPLE_PAY: Apple Pay 感應支付

## Logic
\`\`\`javascript
return {
  order_id: "ORD-" + Math.floor(Math.random() * 900000 + 100000),
  status: "CONFIRMED",
  item: payload.item || "預設商品",
  amount: Number(payload.amount || 0),
  payment_method: payload.paymentMethod || "CREDIT_CARD",
  phase: ctx.phase,
  ai_latency_ms: ctx.aiLatencyMs
};
\`\`\`
`,
      'utf-8'
    );
    console.log(`✅ 已在 ${targetSpecsDir} 建立初始規格範本：order.api.md`);
  } else {
    console.log(`ℹ️  目錄 ${targetSpecsDir} 已存在規格檔案。`);
  }

  console.log(`\n🚀 下一步：在終端機輸入以下指令啟動 Web 控制台：\n   npx jit-api\n`);
  process.exit(0);
}

// Default Command: dev (Start Web Studio & JIT Engine)
const PORT = parseInt(getArg('--port', process.env.PORT || '3005'), 10);
const specsDir = path.resolve(process.cwd(), getArg('--specs', process.env.JIT_SPECS_DIR || 'specs'));

// Ensure specs dir exists in user's cwd
if (!fs.existsSync(specsDir)) {
  fs.mkdirSync(specsDir, { recursive: true });
  const welcomeSpec = path.join(specsDir, 'welcome.api.md');
  fs.writeFileSync(
    welcomeSpec,
    `# API: ping
> 服務健康檢查端點

## Intent
User checks if service is alive, healthcheck or ping

## Fields
- client: string (客戶端標記)

## Logic
\`\`\`javascript
return {
  status: "PONG",
  client: payload.client || "guest",
  server_time: new Date().toISOString()
};
\`\`\`
`,
    'utf-8'
  );
}

const app = express();
app.use(express.json());
app.use(express.text({ type: ['text/plain', 'text/markdown'] }));

// Serve frontend dashboard from packageRoot/public
const publicDir = path.join(packageRoot, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// 1. 初始化 JIT 引擎
const engine = new JITEngine({
  stabilityThreshold: 3,
  confidenceThreshold: 0.85,
  onFreeze: (codegen) => {
    console.log(`\n❄️  [FREEZE] 路由 "${codegen.schema.route}" 結構已凍結！產出合約: ${codegen.files.typescript}`);
  },
  onDrift: (route, error) => {
    console.log(`\n⚠️  [DRIFT] 路由 "${route}" 結構變異: ${error}，自動降級回 Phase 1 並開啟演進觀測。`);
  },
});

// 2. 初始化自適應 MDLoader
const mdLoader = new MDLoader(specsDir);
const loadedSpecs = mdLoader.loadAll(engine);
mdLoader.watch(engine);

// 3. 掛載 MCP Server (SSE)
MCPAdapter.attachToExpress(app, engine, mdLoader, '/sse', '/messages');

// 4. Benchmark Runner
const benchRunner = new BenchmarkRunner();

// ================= API Endpoints =================
app.get('/api/info', (req, res) => {
  res.json({
    name: 'JIT Protocol Synthesis Studio',
    version: '2.0.0',
    port: PORT,
    engine: process.env.TYPESAFE_API_KEY ? 'typesafe' : 'needle',
    routesCount: engine.getRoutes().length,
    specsDir: mdLoader.getSpecsDir(),
  });
});

app.get('/api/routes', (req, res) => {
  const routes = engine.getRoutes().map((r) => ({
    route: r.route,
    description: r.description,
    intentCriteria: r.intentCriteria,
    status: engine.getRouteStatus(r.route),
  }));
  res.json(routes);
});

app.post('/api/jit', async (req, res) => {
  try {
    const result = await engine.execute(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jit/status/:route', (req, res) => {
  res.json(engine.getRouteStatus(req.params.route));
});

app.get('/api/specs', (req, res) => {
  res.json(mdLoader.listSpecs());
});

app.get('/api/specs/:file', (req, res) => {
  try {
    const content = mdLoader.getSpecContent(req.params.file);
    res.type('text/markdown').send(content);
  } catch (err) {
    res.status(404).send(err.message);
  }
});

app.post('/api/specs/:file', (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    mdLoader.saveSpec(req.params.file, content);
    res.json({ success: true, file: req.params.file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/specs/reload', (req, res) => {
  try {
    const reloaded = mdLoader.reload(engine);
    res.json({ success: true, count: reloaded.length, routes: reloaded.map((s) => s.route) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bench/k6', async (req, res) => {
  const options = {
    url: `http://127.0.0.1:${PORT}/api/jit`,
    mode: req.body.mode || 'phase3',
    vus: Number(req.body.vus || 10),
    duration: req.body.duration || '5s',
  };

  try {
    const result = await benchRunner.run(options);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contracts', (req, res) => {
  const lang = req.query.lang || 'typescript';
  const fileMap = {
    typescript: path.join(packageRoot, 'generated/typescript/create_order.ts'),
    python: path.join(packageRoot, 'generated/python/create_order.py'),
    golang: path.join(packageRoot, 'generated/proto/create_order.proto'),
  };

  const targetPath = fileMap[String(lang)] || fileMap.typescript;
  if (fs.existsSync(targetPath)) {
    res.type('text/plain').send(fs.readFileSync(targetPath, 'utf-8'));
  } else {
    res.status(404).send(`// 檔案尚未生成: ${targetPath}\n// 提示：請在「路由即時觀測」發送 3 次請求以觸發自動凍結與合約編譯。`);
  }
});

// 啟動伺服器與 Web Terminal
const server = http.createServer(app);
new TerminalServer(server, '/ws/terminal');

server.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 JIT Protocol Synthesis Studio (CLI) 啟動成功！`);
  console.log(`   - 🌐 前端觀測與壓測儀表板: http://localhost:${PORT}`);
  console.log(`   - 📂 載入規格目錄 (CWD):   ${specsDir}`);
  console.log(`   - 📝 目前掛載 API 數量:    ${loadedSpecs.length} 支`);
  console.log(`   - 💻 整合 Web 終端 (PTY):  http://localhost:${PORT} (底部抽屜)`);
  console.log(`   - 🤖 MCP 協定入口 (SSE):   http://localhost:${PORT}/sse`);
  console.log(`   - ⚡ JIT 動態 API Gateway: http://localhost:${PORT}/api/jit`);
  console.log('='.repeat(70));
});
