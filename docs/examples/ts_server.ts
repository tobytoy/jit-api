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
import path from 'path';
import { JITEngine, JITRequestContext, MDLoader, BenchmarkRunner, MCPAdapter } from '../../core/index.js';

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

// 4. 初始化 Benchmark Runner
const benchRunner = new BenchmarkRunner();

// ================= API Endpoints =================

// 伺服器資訊
app.get('/api/info', (req, res) => {
  const hasKey = !!process.env.TYPESAFE_API_KEY;
  res.json({
    name: 'JIT Protocol Synthesis Studio',
    version: '2.0.0',
    port: process.env.PORT || 3005,
    engine: hasKey ? 'typesafe' : 'needle',
    routesCount: engine.getRoutes().length,
  });
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

// 列出所有 Markdown API 規格
app.get('/api/specs', (req, res) => {
  res.json(mdLoader.listSpecs());
});

// 讀取特定 Markdown API 規格內容
app.get('/api/specs/:file', (req, res) => {
  try {
    const content = mdLoader.getSpecContent(req.params.file);
    res.type('text/markdown').send(content);
  } catch (err: any) {
    res.status(404).send(err.message);
  }
});

// 儲存/新增 Markdown API 規格
app.post('/api/specs/:file', (req, res) => {
  try {
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    mdLoader.saveSpec(req.params.file, content);
    res.json({ success: true, file: req.params.file });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 熱重載所有 Markdown API 規格
app.post('/api/specs/reload', (req, res) => {
  try {
    const reloaded = mdLoader.reload(engine);
    res.json({ success: true, count: reloaded.length, routes: reloaded.map((s) => s.route) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Grafana k6 一鍵壓力測試端點
app.post('/api/bench/k6', async (req, res) => {
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

// 啟動伺服器
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 JIT Protocol Synthesis Studio 啟動成功！`);
  console.log(`   - 🌐 前端觀測與壓測儀表板: http://localhost:${PORT}`);
  console.log(`   - ⚡ JIT 動態 API Gateway: http://localhost:${PORT}/api/jit`);
  console.log(`   - 🤖 MCP 協定入口 (SSE):   http://localhost:${PORT}/sse`);
  console.log(`   - 📊 Grafana k6 壓測 API:  http://localhost:${PORT}/api/bench/k6`);
  console.log('='.repeat(70));
});
