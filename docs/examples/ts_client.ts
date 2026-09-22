/**
 * JIT Protocol Synthesis - Client Test Script
 * 
 * Demonstrates how client interacts with JIT Server across:
 *   Phase 1 (Dynamic) ➔ Phase 2 (Observing) ➔ Phase 3 (Fast-Path) ➔ Schema Drift Fallback
 * 
 * Run with:
 *   npx tsx docs/examples/ts_client.ts
 */

const PORT = process.env.PORT || 3005;
const SERVER_URL = `http://localhost:${PORT}/api/jit`;

async function sendRequest(label: string, payload: Record<string, unknown>) {
  console.log(`\n📤 [${label}] 發送請求:`, JSON.stringify(payload));
  const startTime = Date.now();

  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const totalTime = Date.now() - startTime;
    const body = await res.json();

    if (!res.ok) {
      console.log(`❌ 請求失敗 (${res.status}):`, body.error);
      return;
    }

    console.log(`📥 伺服器響應 (耗時 ${totalTime}ms):`);
    console.log(`   - 命中路由: [${body.context?.route}]`);
    console.log(`   - 處於階段: [${body.context?.phase}]`);
    console.log(`   - AI 耗時:  ${body.context?.aiLatencyMs}ms`);
    console.log(`   - 是否回退: ${body.context?.isFallback ?? false}`);
    console.log(`   - 回傳資料:`, body.data);
  } catch (err: any) {
    console.error(`❌ 連線錯誤: 請確認伺服器是否已在 ${SERVER_URL} 啟動！ (${err.message})`);
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('📱 JIT Client 全生命週期調用展示');
  console.log('='.repeat(70));

  // 1. Phase 1: 鬆散非結構化請求 (前端隨意發送語意)
  await sendRequest('階段 1: Phase 1 語意熱啟動 (鬆散輸入)', {
    message: '哈囉，我要買一台 PS5 遊戲機，刷信用卡，金額是 17500 元',
    item: 'PS5 遊戲機',
    amount: 17500,
  });

  // 2. Phase 2: 連續發送格式一致的請求，使伺服器觀察穩定度並觸發凍結
  console.log('\n--- 連續發送 3 次一致請求以觸發凍結 ---');
  for (let i = 1; i <= 3; i++) {
    await sendRequest(`階段 2: 穩定請求 #${i}`, {
      route: 'create_order',
      item: `熱門商品-${i}`,
      amount: 1000 * i,
      paymentMethod: 'LINE_PAY',
    });
  }

  // 3. Phase 3: 傳統極速期 (0 毫秒 AI 延遲，極速響應)
  await sendRequest('階段 3: Phase 3 極速路徑 (已凍結)', {
    route: 'create_order',
    item: '4K 電競螢幕',
    amount: 18000,
    paymentMethod: 'LINE_PAY',
  });

  // 4. Schema Drift: 業務需求突發變更 (傳入新型態與新欄位)
  await sendRequest('階段 4: Schema Drift 突發變更 (自主演進)', {
    route: 'create_order',
    item: '最新款折疊手機',
    amount: 'INVALID_PRICE_STR', // 故意傳入字串違反原本的數值型態
    couponCode: 'SUMMER_SALE',    // 🌟 新增的未定義欄位
    paymentMethod: 'APPLE_PAY',
  });

  console.log('\n' + '='.repeat(70));
  console.log('🎉 Client 調用示範完成！');
  console.log('='.repeat(70));
}

main().catch(console.error);
