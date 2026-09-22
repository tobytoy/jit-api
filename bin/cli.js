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

const { JITEngine, MDLoader, BenchmarkRunner, MCPAdapter, TerminalServer, SpecTestRunner } = coreModules;

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args[0] : 'dev';

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
  dev               啟動開發模式：含 Web Studio、PTY 終端、動態熱重載 (預設, Port: 3005)
  start | prod      啟動生產模式：高效 API Gateway、安全防護 (停用終端、物理隔離規格, Port: 3000)
  test              自動化執行 specs/ 中所有 ## Sample 測試範例 (例: npx jit-api test)
  release <version> 建立當前 Markdown 規格之版本快照與 SHA-256 簽名 (例: npx jit-api release 1.0.0)
  rollback <version>驗簽並秒級回滾至指定歷史版本 (例: npx jit-api rollback 1.0.0)
  init              在當前專案目錄建立 specs/ 規格目錄與範本

Options:
  --port <number>   指定伺服器連接埠 (dev 預設 3005, prod 預設 3000)
  --specs <path>    指定 Markdown API 規格目錄 (預設: ./specs)
  --headless        關閉 Web Dashboard，以純 API Gateway 運作
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

const specsDir = path.resolve(process.cwd(), getArg('--specs', process.env.JIT_SPECS_DIR || 'specs'));

// Command: test
if (command === 'test') {
  console.log('🧪 JIT API 規格自動化測試套件 (Spec Test Runner)\n' + '='.repeat(60));
  console.log(`📂 載入規格目錄: ${specsDir}`);
  const runner = new SpecTestRunner(specsDir);
  try {
    const report = await runner.runAll();
    console.log(`📝 共掃描到 ${report.totalSpecs} 支 API 規格檔案：\n`);

    for (const item of report.items) {
      const parts = [];
      if (item.hasPayload) {
        parts.push(item.payloadPassed ? '✓ Fast-Path' : '✗ Fast-Path');
      }
      if (item.hasSemantic) {
        parts.push(item.semanticPassed ? '✓ 語意辨識' : '✗ 語意辨識');
      }
      const isOk = (!item.hasPayload || item.payloadPassed) && (!item.hasSemantic || item.semanticPassed);
      const icon = isOk ? '✅' : '❌';
      console.log(`  ${icon} [${item.route}] (${item.filename}) - ${parts.join(', ')} [${item.durationMs}ms]`);

      if (item.payloadError) {
        console.error(`     ⚠️ Payload 測試失敗: ${item.payloadError}`);
      }
      if (item.semanticError) {
        console.error(`     ⚠️ 語意辨識測試失敗: ${item.semanticError}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 測試總結: ${report.passedSpecs} 支通過, ${report.failedSpecs} 支失敗 (共 ${report.passedAssertions}/${report.totalAssertions} 個斷言通過) | 總耗時: ${report.durationMs}ms\n`);

    if (report.failedSpecs > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ 測試執行錯誤:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

// Command: release <version>
if (command === 'release') {
  const version = args[1];
  if (!version) {
    console.error('❌ 請提供版本號！範例: npx jit-api release 1.0.0');
    process.exit(1);
  }
  const notes = args.slice(2).join(' ') || undefined;
  const loader = new MDLoader(specsDir);
  const releaseInfo = loader.snapshotRelease(version, notes);
  console.log(`\n📦 [RELEASE] 成功發布並封存規格快照版本：${releaseInfo.version}`);
  console.log(`   - 📅 發布時間: ${releaseInfo.releasedAt}`);
  console.log(`   - 📝 規格數量: ${releaseInfo.specsCount} 支`);
  console.log(`   - 📂 存放路徑: .jit/releases/${releaseInfo.version}/`);
  process.exit(0);
}

// Command: rollback <version>
if (command === 'rollback') {
  const version = args[1];
  if (!version) {
    console.error('❌ 請提供欲降版之版本號！範例: npx jit-api rollback 1.0.0');
    process.exit(1);
  }
  const loader = new MDLoader(specsDir);
  const tempEngine = new JITEngine();
  try {
    const res = loader.rollback(version, tempEngine);
    console.log(`\n🔄 [ROLLBACK] 降版成功！已成功還原至版本：${res.version}`);
    console.log(`   - 📝 成功還原規格數量: ${res.restoredCount} 支`);
    if (res.orphanedCount > 0) {
      console.log(`   - 📦 隔離備份孤兒規格: ${res.orphanedCount} 支`);
      console.log(`     (存放於: ${res.orphanedBackupDir})`);
    }
    console.log(`   - 🚀 若生產伺服器正在運行，已即時無痛熱加載生效！\n`);
  } catch (err) {
    console.error(`❌ 回滾失敗:`, err.message);
    process.exit(1);
  }
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
Version: 1.0.0
Stage: prod
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

## Sample
- Semantic: 我想訂購一台 iPad Pro 平板電腦，刷 LINE Pay，金額 25900 元
- Payload:
\`\`\`json
{
  "item": "iPad Pro",
  "amount": 25900,
  "paymentMethod": "LINE_PAY"
}
\`\`\`

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

// Server Mode Setup: Dev vs Prod
const isProd = command === 'prod' || command === 'start' || process.env.NODE_ENV === 'production';
const isHeadless = args.includes('--headless') || args.includes('--no-dashboard');
const defaultPort = isProd ? 3000 : 3005;
let PORT = parseInt(getArg('--port', process.env.PORT || String(defaultPort)), 10);
const stageFilter = isProd ? 'prod' : 'all';

// Ensure specs dir exists in user's cwd
if (!fs.existsSync(specsDir)) {
  fs.mkdirSync(specsDir, { recursive: true });
  const welcomeSpec = path.join(specsDir, 'welcome.api.md');
  fs.writeFileSync(
    welcomeSpec,
    `# API: ping
Version: 1.0.0
Stage: prod
> 服務健康檢查端點

## Intent
User checks if service is alive, healthcheck or ping

## Fields
- client: string (客戶端標記)

## Sample
- Semantic: 檢查伺服器健康狀態 ping
- Payload:
\`\`\`json
{
  "client": "healthcheck-agent"
}
\`\`\`

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

// Serve frontend dashboard from packageRoot/public unless --headless
const publicDir = path.join(packageRoot, 'public');
if (!isHeadless && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else if (isHeadless) {
  app.get('/', (req, res) => {
    res.json({
      name: 'JIT Protocol Synthesis Gateway',
      status: 'online',
      mode: isProd ? 'prod' : 'dev',
      headless: true,
      endpoints: {
        jit: '/api/jit',
        routes: '/api/routes',
        mcp: '/sse',
        info: '/api/info',
      },
    });
  });
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

// 2. 初始化自適應 MDLoader (依模式篩選 stage)
const mdLoader = new MDLoader(specsDir);
const loadedSpecs = mdLoader.loadAll(engine, stageFilter);

// 3. 掛載 MCP Server (SSE) - pass isProd, PORT, and stageFilter
MCPAdapter.attachToExpress(app, engine, mdLoader, '/sse', '/messages', isProd, PORT, stageFilter);

// 4. Benchmark Runner
const benchRunner = new BenchmarkRunner();

// ================= API Endpoints =================
app.get('/api/info', (req, res) => {
  let pkgVersion = '1.1.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
    pkgVersion = pkg.version;
  } catch {}

  const currentPort = server.address() && typeof server.address() === 'object' ? server.address().port : PORT;

  res.json({
    name: 'JIT Protocol Synthesis Studio',
    version: pkgVersion,
    mode: isProd ? 'prod' : 'dev',
    headless: isHeadless,
    port: currentPort,
    engine: process.env.TYPESAFE_API_KEY ? 'typesafe' : 'needle',
    routesCount: engine.getRoutes().length,
    specsDir: mdLoader.getSpecsDir(),
    stageFilter,
  });
});

app.get('/api/routes', (req, res) => {
  const routes = engine.getRoutes().map((r) => ({
    route: r.route,
    version: r.version || '1.0.0',
    stage: r.stage || 'dev',
    description: r.description,
    intentCriteria: r.intentCriteria,
    samplePayload: r.samplePayload,
    sampleSemantic: r.sampleSemantic,
    status: engine.getRouteStatus(r.route),
  }));
  res.json(routes);
});

app.post('/api/jit', async (req, res) => {
  try {
    const result = await engine.execute(req.body, undefined, req.headers);
    res.json(result);
  } catch (err) {
    if (err.name === 'UnauthorizedError' || err.statusCode === 401) {
      return res.status(401).json({ error: err.message, status: 401 });
    }
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jit/status/:route', (req, res) => {
  res.json(engine.getRouteStatus(req.params.route));
});

// Spec Management, Contract & Release APIs (Only registered in Dev mode for physical security isolation)
if (!isProd) {
  app.get('/api/specs', (req, res) => {
    res.json(mdLoader.listSpecs(stageFilter));
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
      const reloaded = mdLoader.reload(engine, stageFilter);
      res.json({ success: true, count: reloaded.length, routes: reloaded.map((s) => s.route) });
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

  // Release Management API
  app.get('/api/releases', (req, res) => {
    res.json(mdLoader.listReleases());
  });

  app.post('/api/releases/snapshot', (req, res) => {
    const { version, notes } = req.body;
    if (!version) return res.status(400).json({ error: 'Missing version parameter' });
    try {
      const info = mdLoader.snapshotRelease(version, notes);
      res.json({ success: true, release: info });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/releases/rollback', (req, res) => {
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: 'Missing version parameter' });
    try {
      const info = mdLoader.rollback(version, engine, stageFilter);
      res.json({ success: true, rollback: info });
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
      targetRoute: req.body.targetRoute,
      samplePayload: req.body.samplePayload,
      sampleSemantic: req.body.sampleSemantic,
    };

    try {
      const result = await benchRunner.run(options);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// 啟動伺服器與 Web Terminal (Prod 模式停用 Terminal 以保障系統資安)
let server;

function startServer(portToTry, maxRetries = 10) {
  const currentServer = http.createServer(app);
  if (!isProd) {
    new TerminalServer(currentServer, '/ws/terminal');
  }

  currentServer.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (maxRetries > 0) {
        console.warn(`\n⚠️  [Port 衝突] 連接埠 ${portToTry} 已被佔用，正在嘗試改用 ${portToTry + 1}...`);
        startServer(portToTry + 1, maxRetries - 1);
      } else {
        console.error(`\n❌ [Port 衝突] 連接埠 ${portToTry} 及其後續連接埠均已被佔用！請使用 --port 指定可用連接埠。\n`);
        process.exit(1);
      }
    } else {
      console.error('\n❌ 伺服器啟動時發生未預期錯誤:', err);
      process.exit(1);
    }
  });

  currentServer.listen(portToTry, () => {
    server = currentServer;
    PORT = portToTry;
    console.log('='.repeat(70));
    if (isProd) {
      console.log(`🔒 [PROD MODE] JIT Protocol Synthesis 生產網關啟動成功！`);
      console.log(`   - 🚀 高吞吐靜態 API 入口:  http://localhost:${PORT}/api/jit`);
      console.log(`   - 🛡️ 安全狀態:              Web Terminal 已停用, 規格修改已封鎖`);
      console.log(`   - 🏷️ API Stage 篩選:        僅載入 Stage: prod 規格`);
      console.log(`   - 📝 目前掛載 API 數量:    ${loadedSpecs.length} 支`);
      if (isHeadless) {
        console.log(`   - ⚡ 運作模式:              純 API Gateway (--headless, 無 Web Dashboard)`);
      } else {
        console.log(`   - 🌐 唯讀觀測儀表板:        http://localhost:${PORT}`);
      }
      console.log(`   - 🤖 MCP 協定入口 (SSE):   http://localhost:${PORT}/sse`);
    } else {
      console.log(`🚀 [DEV MODE] JIT Protocol Synthesis Studio 開發控制台啟動成功！`);
      if (isHeadless) {
        console.log(`   - ⚡ 運作模式:              Headless 開發網關 (--headless)`);
      } else {
        console.log(`   - 🌐 前端觀測與壓測儀表板: http://localhost:${PORT}`);
        console.log(`   - 💻 整合 Web 終端 (PTY):  http://localhost:${PORT} (底部抽屜)`);
      }
      console.log(`   - 📂 載入規格目錄 (CWD):   ${specsDir}`);
      console.log(`   - 📝 目前掛載 API 數量:    ${loadedSpecs.length} 支 (含 Dev 草稿)`);
      console.log(`   - 🤖 MCP 協定入口 (SSE):   http://localhost:${PORT}/sse`);
      console.log(`   - ⚡ JIT 動態 API Gateway: http://localhost:${PORT}/api/jit`);
    }
    console.log('='.repeat(70));
  });
}

startServer(PORT);
