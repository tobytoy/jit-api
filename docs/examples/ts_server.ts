/**
 * JIT Protocol Synthesis - Express Server Example
 * 
 * Run with:
 *   npx tsx docs/examples/ts_server.ts
 */

import express from 'express';
import { JITEngine, JITRequestContext } from '../../core/index.js';

const app = express();
app.use(express.json());

// 1. 初始化 JIT 引擎 (設定穩定度門檻 = 3)
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

// 2. 註冊結帳下單端點
engine.register({
  route: 'create_order',
  description: '處理使用者下單與訂單成立',
  intentCriteria: 'User wants to buy, purchase, checkout or order items and products',
  enumFields: {
    paymentMethod: {
      CREDIT_CARD: '信用卡付款',
      LINE_PAY: 'Line Pay 行動支付',
      APPLE_PAY: 'Apple Pay 行動支付',
    },
  },
  handler: async (payload: any, ctx: JITRequestContext) => {
    return {
      orderId: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      status: 'CONFIRMED',
      item: payload.item || '預設商品',
      amount: Number(payload.amount ?? 0),
      paymentMethod: payload.paymentMethod || 'CREDIT_CARD',
      processedPhase: ctx.phase,
      aiLatencyMs: ctx.aiLatencyMs,
      engineUsed: ctx.engineUsed,
    };
  },
});

// 3. 單一動態 JIT Gateway 入口
app.post('/api/jit', async (req, res) => {
  try {
    const result = await engine.execute(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. 路由狀態查詢入口
app.get('/api/jit/status/:route', (req, res) => {
  res.json(engine.getRouteStatus(req.params.route));
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 JIT Express Server 啟動於 http://localhost:${PORT}`);
  console.log(`   - POST http://localhost:${PORT}/api/jit (動態進入點)`);
  console.log(`   - GET  http://localhost:${PORT}/api/jit/status/create_order (狀態查詢)`);
  console.log('='.repeat(70));
});
