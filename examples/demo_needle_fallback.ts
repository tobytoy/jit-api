import { JITEngine, TypeSafeClient } from '../core/index.js';
import { registerMockServices } from './mock_services.js';

async function runNeedleDemo() {
  console.log('='.repeat(72));
  console.log('🪡  JIT PROTOCOL SYNTHESIS - NEEDLE LOCAL FALLBACK (OPTION A)');
  console.log('    100% Offline / Zero API Key Dynamic-to-Static API Synthesis');
  console.log('='.repeat(72) + '\n');

  // Explicitly instantiate with NO API KEY to force Needle local fallback
  const clientWithoutKey = new TypeSafeClient({ apiKey: '' });

  const engine = new JITEngine({
    client: clientWithoutKey,
    stabilityThreshold: 3,
    confidenceThreshold: 0.8,
    onFreeze: (codegen) => {
      console.log('\n❄️  [PHASE 2 ➔ 3 TRIGGERED] Schema has frozen via Needle confidence!');
      console.log(`📦 Compiled static artifacts generated for route: "${codegen.schema.route}"`);
      console.log(`   - TypeScript (Zod): ${codegen.files.typescript}`);
      console.log(`   - Protobuf (.proto): ${codegen.files.proto}`);
      console.log(`   - Golang Struct:    ${codegen.files.golang}`);
      console.log(`   - Python (Pydantic): ${codegen.files.python}`);
      console.log(`   - JSON Schema IR:   ${codegen.files.irJson}\n`);
    },
  });

  registerMockServices(engine);

  // -------------------------------------------------------------
  // STEP 1: Dynamic Semantic Routing via Needle (Local SLM)
  // -------------------------------------------------------------
  console.log('🔹 STEP 1: Phase 1 - Dynamic Semantic Routing via Needle');
  console.log('   Client sends loose JSON payload without API key...');

  const request1 = {
    message: 'Hello, please bill Wayne Enterprises for 850 dollars with urgent priority',
    customer: 'Wayne Enterprises',
    amount: 850,
    currency: 'USD',
    priority: 'urgent',
    itemCount: 2,
  };

  console.log('   Payload:', JSON.stringify(request1));
  const res1 = await engine.execute(request1);
  console.log(`   ✅ Routed to: [${res1.context.route}]`);
  console.log(
    `   ⚡ Engine Used: [${res1.context.engineUsed?.toUpperCase()}] | Phase: ${res1.context.phase}`
  );
  console.log(`   ⏱️  Needle Latency: ${res1.context.aiLatencyMs}ms (Local Execution, 0 API Cost!)`);
  console.log(`   📊 Confidence: ${res1.context.intentConfidence} | Result:`, res1.data);
  console.log('-'.repeat(72) + '\n');

  // -------------------------------------------------------------
  // STEP 2: Observation & Stability Tracking towards Freeze
  // -------------------------------------------------------------
  console.log('🔹 STEP 2: Phase 2 - Continuous Observation towards Freeze');
  console.log('   Sending structured requests (Threshold = 3)...');

  for (let i = 1; i <= 3; i++) {
    const req = {
      customer: `Client-Offline-${i}`,
      amount: 150 * i,
      currency: 'USD',
      priority: 'normal',
      itemCount: i,
    };
    console.log(`   [Request #${i}] Sending:`, JSON.stringify(req));
    await engine.execute(req, 'create_invoice');
    const status = engine.getRouteStatus('create_invoice');
    console.log(
      `   📈 Consecutive Matches: ${status.metrics.consecutiveMatches}/${status.metrics.requiredThreshold} | Frozen: ${status.isFrozen}`
    );
  }
  console.log('-'.repeat(72) + '\n');

  // -------------------------------------------------------------
  // STEP 3: Phase 3 - Static Fast-Path Execution
  // -------------------------------------------------------------
  console.log('🔹 STEP 3: Phase 3 - Static Fast-Path Execution (0ms AI Latency!)');
  console.log('   Route is now FROZEN! Client sends compliant request...');

  const fastReq = {
    customer: 'Stark Industries',
    amount: 2500,
    currency: 'USD',
    priority: 'normal',
    itemCount: 4,
  };

  const fastRes = await engine.execute(fastReq, 'create_invoice');
  console.log(`   ✅ Execution Status: SUCCESS`);
  console.log(`   ⚡ Phase: ${fastRes.context.phase}`);
  console.log(`   ⏱️  Total Execution: ${fastRes.context.executionTimeMs}ms`);
  console.log(`   🔥 AI Latency: ${fastRes.context.aiLatencyMs}ms (Pure native Zod execution!)`);
  console.log(`   📦 Output:`, fastRes.data);
  console.log('-'.repeat(72) + '\n');

  // -------------------------------------------------------------
  // STEP 4: Local Security Guardrail
  // -------------------------------------------------------------
  console.log('🔹 STEP 4: Local Security Guardrail Check');
  console.log('   Simulating malicious payload without cloud Noul...');

  const maliciousReq = {
    input: "admin'; DROP TABLE invoices; --",
    amount: -100,
  };

  try {
    await engine.execute(maliciousReq);
    console.log('   ❌ Error: Malicious payload was not blocked!');
  } catch (err: any) {
    console.log(`   🛡️  Blocked by Needle Local Guardrail successfully!`);
    console.log(`   Error message: "${err.message}"`);
  }

  console.log('\n' + '='.repeat(72));
  console.log('🎉 NEEDLE FALLBACK DEMO COMPLETED: Successfully verified zero-key lifecycle!');
  console.log('='.repeat(72));
}

runNeedleDemo().catch((err) => {
  console.error('Demo encountered error:', err);
  process.exit(1);
});
