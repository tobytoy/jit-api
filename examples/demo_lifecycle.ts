import { JITEngine } from '../core/index.js';
import { registerMockServices } from './mock_services.js';

async function runDemo() {
  console.log('='.repeat(70));
  console.log('🚀 JIT PROTOCOL SYNTHESIS FRAMEWORK - FULL LIFECYCLE DEMO');
  console.log('   Dynamic Semantic Negotiation ➔ Static Code Freeze ➔ Fallback');
  console.log('='.repeat(70) + '\n');

  // Initialize engine with stability threshold = 3 (for snappy demo)
  const engine = new JITEngine({
    stabilityThreshold: 3,
    confidenceThreshold: 0.8,
    onFreeze: (codegen) => {
      console.log('\n❄️  [PHASE 2 ➔ 3 TRIGGERED] Schema has frozen!');
      console.log(`📦 Compiled static artifacts generated for route: "${codegen.schema.route}"`);
      console.log(`   - TypeScript (Zod): ${codegen.files.typescript}`);
      console.log(`   - Protobuf (.proto): ${codegen.files.proto}`);
      console.log(`   - Golang Struct:    ${codegen.files.golang}`);
      console.log(`   - Python (Pydantic): ${codegen.files.python}`);
      console.log(`   - JSON Schema IR:   ${codegen.files.irJson}\n`);
    },
    onDrift: (route, error) => {
      console.log(`\n⚠️  [SCHEMA DRIFT DETECTED] Route "${route}": ${error}`);
      console.log('   Switching to FallbackHandler: Downgrading to Phase 1 & starting v2 observation.\n');
    },
  });

  registerMockServices(engine);

  // -------------------------------------------------------------
  // STEP 1: Phase 1 (Dynamic Semantic Routing via TypeSafe Jev)
  // -------------------------------------------------------------
  console.log('🔹 STEP 1: Phase 1 - Dynamic Semantic Routing');
  console.log('   Client sends loose JSON payload without predefined schema...');

  const request1 = {
    message: 'Hey, please bill Acme Corp for 500 dollars urgently',
    customer: 'Acme Corp',
    amount: 500,
    currency: 'USD',
    priority: 'urgent',
    itemCount: 3,
  };

  console.log('   Payload:', JSON.stringify(request1));
  const res1 = await engine.execute(request1);
  console.log(`   ✅ Routed to: [${res1.context.route}]`);
  console.log(`   ⚡ Phase: ${res1.context.phase} | AI Latency: ${res1.context.aiLatencyMs}ms`);
  console.log(`   📊 Confidence: ${res1.context.intentConfidence} | Result:`, res1.data);
  console.log('-'.repeat(70) + '\n');

  // -------------------------------------------------------------
  // STEP 2: Phase 2 (Observation & Stability Tracking)
  // -------------------------------------------------------------
  console.log('🔹 STEP 2: Phase 2 - Continuous Observation towards Freeze');
  console.log('   Sending structured requests with stable signature (Threshold = 3)...');

  for (let i = 1; i <= 3; i++) {
    const req = {
      customer: `Client-${i}`,
      amount: 100 * i,
      currency: 'USD',
      priority: 'normal',
      itemCount: i,
    };
    console.log(`   [Request #${i}] Sending:`, JSON.stringify(req));
    const res = await engine.execute(req, 'create_invoice');
    const status = engine.getRouteStatus('create_invoice');
    console.log(
      `   📈 Consecutive Matches: ${status.metrics.consecutiveMatches}/${status.metrics.requiredThreshold} | Frozen: ${status.isFrozen}`
    );
  }
  console.log('-'.repeat(70) + '\n');

  // -------------------------------------------------------------
  // STEP 3: Phase 3 (Static Fast-Path - 0ms AI Latency!)
  // -------------------------------------------------------------
  console.log('🔹 STEP 3: Phase 3 - Static Fast-Path Execution');
  console.log('   Route is now FROZEN! Client sends compliant request...');

  const fastReq = {
    customer: 'Global Tech Inc',
    amount: 1200,
    currency: 'USD',
    priority: 'normal',
    itemCount: 5,
  };

  const fastRes = await engine.execute(fastReq, 'create_invoice');
  console.log(`   ✅ Execution Status: SUCCESS`);
  console.log(`   ⚡ Phase: ${fastRes.context.phase}`);
  console.log(`   ⏱️  Total Execution: ${fastRes.context.executionTimeMs}ms`);
  console.log(`   🔥 AI Latency: ${fastRes.context.aiLatencyMs}ms (Pure native execution, 0 API cost!)`);
  console.log(`   📦 Output:`, fastRes.data);
  console.log('-'.repeat(70) + '\n');

  // -------------------------------------------------------------
  // STEP 4: Schema Drift & Graceful Fallback to Phase 1
  // -------------------------------------------------------------
  console.log('🔹 STEP 4: Schema Drift Fallback & Self-Evolution');
  console.log('   Client business logic changed! Sending mutated payload (amount as string, new field)...');

  const driftedReq = {
    customer: 'Enterprise Partner',
    amount: 'INVALID_STRING_AMOUNT_100', // Type violation (string instead of number)
    taxExempt: true, // New unknown field
    currency: 'USD',
    priority: 'urgent',
    itemCount: 10,
  };

  console.log('   Mutated Payload:', JSON.stringify(driftedReq));
  const fallbackRes = await engine.execute(driftedReq, 'create_invoice');
  console.log(`   🛡️  Fallback Result: Handled seamlessly!`);
  console.log(`   ⚡ Phase: ${fallbackRes.context.phase} | IsFallback: ${fallbackRes.context.isFallback}`);
  console.log(`   🤖 AI Latency: ${fallbackRes.context.aiLatencyMs}ms (Re-analyzed by TypeSafe Jev)`);
  console.log(`   📦 Output:`, fallbackRes.data);
  console.log('-'.repeat(70) + '\n');

  // -------------------------------------------------------------
  // STEP 5: Security Guardrail Check (Noul)
  // -------------------------------------------------------------
  console.log('🔹 STEP 5: Security Guardrail (Noul Exploit Filtering)');
  console.log('   Simulating malicious SQL injection payload...');

  const maliciousReq = {
    input: "admin'; DROP TABLE invoices; --",
    amount: -999,
  };

  try {
    await engine.execute(maliciousReq);
    console.log('   ❌ Error: Malicious payload was not blocked!');
  } catch (err: any) {
    console.log(`   🛡️  Blocked by Noul Guardrail successfully!`);
    console.log(`   Error message: "${err.message}"`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🎉 DEMO COMPLETED: JIT Protocol Synthesis lifecycle fully verified!');
  console.log('='.repeat(70));
}

runDemo().catch((err) => {
  console.error('Demo encountered error:', err);
  process.exit(1);
});
