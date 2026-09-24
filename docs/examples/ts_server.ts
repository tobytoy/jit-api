/**
 * JIT Protocol Synthesis - Full Dashboard & API Server
 * 
 * Features:
 *  - JIT Dynamic Gateway & Static Fast-Path Engine
 *  - Markdown API Specification Auto-Loading & Hot-Reloading (`specs/*.api.md`)
 *  - Grafana k6 Stress Testing Integration (`/api/bench/k6`)
 *  - Glassmorphic Web Dashboard (`public/index.html`)
 * 
 * Run with:
 *   npx tsx docs/examples/ts_server.ts
 *   or ./run.sh
 */

import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { JITEngine, JITRequestContext, MDLoader, BenchmarkRunner, MCPAdapter, TerminalServer, ConnectAdapter, TicketStore, LineService, JevReviewer, MasterAuthManager } from '../../core/index.js';

const app = express();
app.use(express.json());
app.use(express.text({ type: ['text/plain', 'text/markdown'] }));

// Serve static frontend dashboard
const publicDir = path.resolve('public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// 1. 初始化 JIT 引擎 (穩定度門檻 = 3)
const engine = new JITEngine({
  stabilityThreshold: 3,
  confidenceThreshold: 0.85,
  onFreeze: (codegen) => {
    console.log(`\n❄️  [FREEZE] 路由 "${codegen.schema.route}" 結構已凍結！`);
    console.log(`   - TypeScript: ${codegen.files.typescript}`);
    console.log(`   - Protobuf:   ${codegen.files.proto}`);
    console.log(`   - Go Struct:  ${codegen.files.golang}`);
    console.log(`   - Python:     ${codegen.files.python}\n`);
  },
  onDrift: (route, error) => {
    console.log(`\n⚠️  [DRIFT] 路由 "${route}" 偵測到結構變異: ${error}`);
    console.log('   已自動觸發 FallbackHandler 降級回 Phase 1，並開啟 v2 演化觀測。\n');
  },
});

// 2. 初始化 Markdown API Loader 並自動掛載 specs/
const mdLoader = new MDLoader('specs');
const loadedSpecs = mdLoader.loadAll(engine);
console.log(`📝 已自動從 specs/ 目錄掛載 ${loadedSpecs.length} 支 Markdown API:`);
loadedSpecs.forEach((s) => console.log(`   - [${s.route}] ${s.description}`));

// 啟動 specs/ 目錄自動熱監聽 (存檔自動無縫更新，無需重啟伺服器)
mdLoader.watch(engine);

// 3. 掛載 MCP Server (Model Context Protocol - SSE 模式)
MCPAdapter.attachToExpress(app, engine, mdLoader, '/sse', '/messages');

// 4. 掛載 ConnectRPC (Triple-Protocol: Connect / gRPC-Web / gRPC)
ConnectAdapter.attachToExpress(app, engine, mdLoader);

// 5. 初始化 Benchmark Runner
const benchRunner = new BenchmarkRunner();

// 6. 初始化 LINE 協同與工單系統 (Master 控制核心)
const ticketStore = new TicketStore();
const jevReviewer = new JevReviewer();
const lineService = new LineService({
  ticketStore,
  jitEngine: engine,
  jevReviewer,
  trafficLightManager: engine.getTrafficLightManager(),
});

// 7. 初始化 Master 安全認證與上游代理
const masterAuth = new MasterAuthManager();
const upstreamClient = engine.getUpstreamClient();
const tenantStore = engine.getTenantStore();

// ================= API Endpoints =================

// 伺服器資訊
app.get('/api/info', (req, res) => {
  const hasKey = !!process.env.TYPESAFE_API_KEY;
  const authStatus = masterAuth.getStatus(req);
  res.json({
    name: 'JIT Protocol Synthesis Studio',
    version: '2.0.0',
    port: process.env.PORT || 3005,
    engine: hasKey ? 'typesafe' : 'needle',
    routesCount: engine.getRoutes().length,
    auth: authStatus,
  });
});

// ================= Master 身份驗證與安全保護 =================

// 讀取當前連線身份與 Master 認證狀態
app.get('/api/auth/status', (req, res) => {
  res.json(masterAuth.getStatus(req));
});

// Master 密碼登入 (支援防暴力破解封鎖)
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const result = masterAuth.login(req.body?.password || '', ip);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

// Master 登出
app.post('/api/auth/logout', (req, res) => {
  const token = masterAuth.extractToken(req);
  if (token) masterAuth.logout(token);
  res.json({ success: true });
});

// ================= Upstream 機密與代理管理 (Master 專屬) =================

// 查詢已註冊的 Upstream 機密 (遮罩保護)
app.get('/api/upstream/secrets', masterAuth.requireMaster, (req, res) => {
  res.json(upstreamClient.listSecrets());
});

// 新增或更新 Upstream 機密 (儲存於 .jit/upstream_secrets.json，嚴格 gitignore)
app.post('/api/upstream/secrets', masterAuth.requireMaster, (req, res) => {
  const { ref, value } = req.body;
  if (!ref || !value) return res.status(400).json({ error: '缺少 ref 或 value 欄位' });
  upstreamClient.setSecret(ref, value);
  res.json({ success: true, ref, masked: upstreamClient.maskSecret(value) });
});

// 刪除 Upstream 機密
app.delete('/api/upstream/secrets/:ref', masterAuth.requireMaster, (req, res) => {
  const ref = String(req.params.ref);
  const deleted = upstreamClient.deleteSecret(ref);
  res.json({ success: deleted, ref });
});

// ================= 多租戶與 API Key 權限中心 (Master 專屬) =================

// 列出所有租戶與 API Keys
app.get('/api/tenants', masterAuth.requireMaster, (req, res) => {
  res.json(tenantStore?.listTenants() || []);
});

// 建立新租戶 / API Key
app.post('/api/tenants', masterAuth.requireMaster, (req, res) => {
  const { name, role, allowedRoutes, lineUserId, company, rateLimit } = req.body;
  if (!name || !role) return res.status(400).json({ error: '缺少 name 或 role 欄位' });
  const tenant = tenantStore?.createTenant({
    name,
    role,
    allowedRoutes: Array.isArray(allowedRoutes) ? allowedRoutes : ['*'],
    lineUserId,
    company,
    rateLimit,
  });
  res.json({ success: true, tenant });
});

// 刪除租戶
app.delete('/api/tenants/:id', masterAuth.requireMaster, (req, res) => {
  const id = String(req.params.id);
  const deleted = tenantStore?.deleteTenant(id);
  res.json({ success: deleted, id });
});

// 查詢所有已掛載路由及其即時狀態
app.get('/api/routes', (req, res) => {
  const routes = engine.getRoutes().map((r) => ({
    route: r.route,
    description: r.description,
    intentCriteria: r.intentCriteria,
    status: engine.getRouteStatus(r.route),
  }));
  res.json(routes);
});

// 單一動態 JIT Gateway 入口
app.post('/api/jit', async (req, res) => {
  try {
    const result = await engine.execute(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 單一路由狀態查詢
app.get('/api/jit/status/:route', (req, res) => {
  res.json(engine.getRouteStatus(req.params.route));
});

// 協同與紅綠燈狀態查詢
app.get('/api/coordination/status', (req, res) => {
  const routes = engine.getRoutes().map((r) => {
    const s = engine.getRouteStatus(r.route);
    return {
      route: r.route,
      trafficLight: s.trafficLight,
      isFrozen: s.isFrozen,
      phase: s.trafficLight.phase,
    };
  });
  const locks = engine.getTrafficLightManager().listLocks();
  res.json({ routes, locks });
});

// 獲取獨佔操作鎖
app.post('/api/coordination/lock', masterAuth.requireMaster, (req, res) => {
  const { route, role, reason, ttlMs } = req.body;
  if (!route || !role) {
    return res.status(400).json({ error: 'Missing required field: route and role' });
  }
  const result = engine.acquireLock({
    route,
    role,
    reason: reason || `Active operation by ${role}`,
    ttlMs: ttlMs ? Number(ttlMs) : undefined,
  });
  if (!result.success) {
    return res.status(409).json(result);
  }
  res.json(result);
});

// 釋放操作鎖
app.post('/api/coordination/unlock', masterAuth.requireMaster, (req, res) => {
  const { route, role } = req.body;
  if (!route) {
    return res.status(400).json({ error: 'Missing required field: route' });
  }
  const released = engine.releaseLock(route, role || 'force');
  res.json({ success: released, route });
});

// ================= LINE 協同與工單中心 API (Master 控制台) =================

// 讀取 LINE Bot 組態
app.get('/api/line/config', (req, res) => {
  res.json(lineService.getConfig());
});

// 儲存 LINE Bot 組態
app.post('/api/line/config', masterAuth.requireMaster, (req, res) => {
  const updated = lineService.saveConfig(req.body);
  res.json({ success: true, config: updated });
});

// 讀取白名單名冊
app.get('/api/line/whitelist', (req, res) => {
  res.json(ticketStore.getWhitelist());
});

// 新增白名單成員
app.post('/api/line/whitelist', masterAuth.requireMaster, (req, res) => {
  const { id, name, role, allowedApis, company } = req.body;
  if (!id || !name) return res.status(400).json({ error: '缺少 id 或 name 欄位' });
  const user = ticketStore.addWhitelistUser({
    id,
    name,
    role: role || 'client',
    allowedApis: Array.isArray(allowedApis) ? allowedApis : undefined,
    company,
    addedAt: Date.now(),
  });
  res.json({ success: true, user });
});

// 刪除白名單成員
app.delete('/api/line/whitelist/:id', masterAuth.requireMaster, (req, res) => {
  const id = String(req.params.id);
  const ok = ticketStore.removeWhitelistUser(id);
  res.json({ success: ok, id });
});

// 讀取所有需求工單清單 (#TKT-xxxx)
app.get('/api/line/tickets', (req, res) => {
  res.json(ticketStore.listTickets());
});

// 觸發 TypeSafe Jev 智慧審查評審
app.post('/api/line/tickets/:id/review', masterAuth.requireMaster, async (req, res) => {
  const ticketId = String(req.params.id);
  const ticket = ticketStore.getTicket(ticketId);
  if (!ticket) return res.status(404).json({ error: '找不到該工單' });

  ticketStore.updateTicket(ticket.id, { status: 'EVALUATING' });

  const existingRoutes = engine.getRoutes().map((r) => ({
    path: r.route,
    description: r.description,
    schema: r.samplePayload,
  }));

  const review = await jevReviewer.reviewTicket(ticket, existingRoutes);
  const updated = ticketStore.updateTicket(ticket.id, {
    status: review.decision === 'HIGH_BREAKING_RISK' ? 'REJECTED' : 'PENDING',
    jevReview: review,
    importanceScore: review.importanceScore,
    priorityLevel: review.priorityLevel,
    urgency: review.urgency,
    situationSummary: review.situationSummary,
    triageAction: review.triageAction,
  });

  res.json({ success: true, ticket: updated });
});

// Master 批閱工單 (批准並一鍵生成 Spec 或駁回)
app.post('/api/line/tickets/:id/action', masterAuth.requireMaster, (req, res) => {
  const ticketId = String(req.params.id);
  const { action, notes, synthesizeSpec } = req.body;
  const ticket = ticketStore.getTicket(ticketId);
  if (!ticket) return res.status(404).json({ error: '找不到該工單' });

  if (action === 'APPROVE') {
    let specFile = ticket.synthesizedSpecFile;
    if (synthesizeSpec && ticket.jevReview?.suggestedPatch) {
      try {
        const cleanName = ticket.id.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const filename = `ticket_${cleanName}.api.md`;
        const specDir = path.resolve('specs');
        if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true });
        const filePath = path.join(specDir, filename);
        fs.writeFileSync(filePath, ticket.jevReview.suggestedPatch, 'utf-8');
        specFile = filename;
        mdLoader.reload(engine);
      } catch (err: any) {
        console.error('[MasterAction] Spec synthesis error:', err);
      }
    }

    const updated = ticketStore.updateTicket(ticket.id, {
      status: synthesizeSpec ? 'SYNTHESIZED' : 'APPROVED',
      masterNotes: notes || 'Master 已批准此需求',
      synthesizedSpecFile: specFile,
    });
    return res.json({ success: true, ticket: updated });
  } else if (action === 'REJECT') {
    const updated = ticketStore.updateTicket(ticket.id, {
      status: 'REJECTED',
      masterNotes: notes || 'Master 經評估駁回此需求',
    });
    return res.json({ success: true, ticket: updated });
  }

  res.status(400).json({ error: '無效的操作動作，僅支援 APPROVE 或 REJECT' });
});

// LINE 互動模擬器 (供 Web Studio 免連線即時測試)
app.post('/api/line/simulate', async (req, res) => {
  const { userId, userName, message } = req.body;
  if (!message) return res.status(400).json({ error: '缺少 message 訊息文字' });

  const result = await lineService.handleMessage({
    source: 'simulator',
    userId: userId || 'U_DEV_LEAD',
    userName: userName || 'Master Engineer',
    message,
  });

  res.json(result);
});

// 實體 LINE Messaging API Webhook
app.post('/api/line/webhook', async (req, res) => {
  const events = req.body?.events || [];
  const results = [];
  for (const evt of events) {
    if (evt.type === 'message' && evt.message?.type === 'text') {
      const reply = await lineService.handleMessage({
        source: 'line',
        userId: evt.source?.userId || 'U_LINE_ANON',
        userName: 'LINE User',
        message: evt.message.text,
      });
      results.push(reply);
    }
  }
  res.json({ success: true, count: results.length });
});

// 歷史版本清單與快照回滾
app.get('/api/releases', (req, res) => {
  res.json(mdLoader.listReleases());
});

app.post('/api/releases/snapshot', masterAuth.requireMaster, (req, res) => {
  const { version, notes } = req.body;
  if (!version) return res.status(400).json({ error: 'Missing version parameter' });
  try {
    const info = mdLoader.snapshotRelease(version, notes);
    res.json({ success: true, release: info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/releases/rollback', masterAuth.requireMaster, (req, res) => {
  const { version } = req.body;
  if (!version) return res.status(400).json({ error: 'Missing version parameter' });
  try {
    const info = mdLoader.rollback(version, engine);
    res.json({ success: true, rollback: info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 列出所有 Markdown API 規格
app.get('/api/specs', (req, res) => {
  res.json(mdLoader.listSpecs());
});

// 讀取特定 Markdown API 規格內容
app.get('/api/specs/:file', (req, res) => {
  try {
    const file = String(req.params.file);
    const content = mdLoader.getSpecContent(file);
    res.type('text/markdown').send(content);
  } catch (err: any) {
    res.status(404).send(err.message);
  }
});

// 儲存/新增 Markdown API 規格
app.post('/api/specs/:file', masterAuth.requireMaster, (req, res) => {
  try {
    const file = String(req.params.file);
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    mdLoader.saveSpec(file, content);
    res.json({ success: true, file });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 熱重載所有 Markdown API 規格
app.post('/api/specs/reload', masterAuth.requireMaster, (req, res) => {
  try {
    const reloaded = mdLoader.reload(engine);
    res.json({ success: true, count: reloaded.length, routes: reloaded.map((s) => s.route) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Grafana k6 一鍵壓力測試端點
app.post('/api/bench/k6', masterAuth.requireMaster, async (req, res) => {
  const port = process.env.PORT || 3005;
  const options = {
    url: `http://127.0.0.1:${port}/api/jit`,
    mode: req.body.mode || 'phase3',
    vus: Number(req.body.vus || 10),
    duration: req.body.duration || '5s',
  };

  try {
    const result = await benchRunner.run(options);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 讀取生成的合約代碼
app.get('/api/contracts', (req, res) => {
  const lang = req.query.lang || 'typescript';
  const fileMap: Record<string, string> = {
    typescript: 'generated/typescript/create_order.ts',
    python: 'generated/python/create_order.py',
    golang: 'generated/proto/create_order.proto',
  };

  const targetPath = path.resolve(fileMap[String(lang)] || fileMap.typescript);
  if (fs.existsSync(targetPath)) {
    res.type('text/plain').send(fs.readFileSync(targetPath, 'utf-8'));
  } else {
    res.status(404).send(`// 檔案尚未生成: ${targetPath}\n// 提示：請在「路由即時觀測」發送 3 次請求以觸發自動凍結與合約編譯。`);
  }
});

// 建立 HTTP 伺服器並掛載 Web Terminal (WebSocket 搭配 Master 身份認證)
const PORT = process.env.PORT || (process.env.SPACE_ID || process.env.SPACE_HOST ? 7860 : 3005);
const server = http.createServer(app);

new TerminalServer(server, '/ws/terminal', (req) => {
  if (!masterAuth.isAuthEnabled()) return true;
  try {
    const host = req.headers.host || 'localhost';
    const parsed = new URL(req.url || '', `http://${host}`);
    const token = parsed.searchParams.get('token') || (req.headers['x-master-token'] as string);
    return masterAuth.validateToken(token);
  } catch {
    return false;
  }
});

server.listen(PORT, () => {
  const isHF = Boolean(process.env.SPACE_ID || process.env.SPACE_HOST);
  console.log('='.repeat(70));
  console.log(`🚀 JIT Protocol Synthesis Studio 啟動成功！`);
  console.log(`   - 🌐 前端觀測與壓測儀表板: http://localhost:${PORT}`);
  console.log(`   - 💻 整合 Web 終端 (PTY):  http://localhost:${PORT} (底部抽屜)`);
  console.log(`   - ⚡ JIT 動態 API Gateway: http://localhost:${PORT}/api/jit`);
  console.log(`   - 🤖 MCP 協定入口 (SSE):   http://localhost:${PORT}/sse`);
  console.log(`   - 📊 Grafana k6 壓測 API:  http://localhost:${PORT}/api/bench/k6`);
  if (isHF) {
    console.log(`   - ☁️  已檢測到 Hugging Face Spaces 環境 (預設連接埠: ${PORT})`);
  }
  if (!masterAuth.isAuthEnabled()) {
    console.log(`   - ⚠️  提示：未設定 MASTER_PASSWORD，目前為開放開發模式。對外公開前請設定 MASTER_PASSWORD！`);
  } else {
    console.log(`   - 🛡️  Master 密碼防護已啟用，訪客僅限唯讀/測試，管理操作需密碼驗證。`);
  }
  console.log('='.repeat(70));
});
