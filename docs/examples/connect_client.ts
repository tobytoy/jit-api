/**
 * JIT Protocol Synthesis - ConnectRPC Client Example
 * 
 * Demonstrates calling JIT-API using the Connect Protocol (HTTP POST + JSON / Protobuf)
 * with native fetch, connect-es, or curl.
 * 
 * Run with:
 *   npx tsx docs/examples/connect_client.ts
 */

const BASE_URL = process.env.JIT_URL || 'http://localhost:3005';
const SERVICE = 'jit.v1.JITService';

async function main() {
  console.log('='.repeat(70));
  console.log('⚡ JIT Protocol Synthesis - ConnectRPC Client Demo');
  console.log(`📡 Connecting to: ${BASE_URL}/${SERVICE}`);
  console.log('='.repeat(70));

  // 1. Service Discovery / Schema Reflection
  console.log('\n🔍 Step 1: Querying ConnectRPC Service Reflection...');
  try {
    const describeRes = await fetch(`${BASE_URL}/${SERVICE}`);
    if (describeRes.ok) {
      const metadata = await describeRes.json();
      console.log(`✅ Service: ${metadata.service} (${metadata.protocol})`);
      console.log(`📋 Available Methods (${metadata.methods.length}):`);
      for (const m of metadata.methods) {
        console.log(`   - [${m.method}] ${m.path} ${m.phase ? `(${m.phase})` : ''}`);
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Could not connect to running server. Ensure server is started with: npm run dev');
    return;
  }

  // 2. Calling Universal Execute RPC
  console.log('\n📦 Step 2: Calling Universal RPC (/Execute)...');
  const executeRes = await fetch(`${BASE_URL}/${SERVICE}/Execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
    },
    body: JSON.stringify({
      route: 'create_order',
      payload: {
        item: 'MacBook Pro M4',
        amount: 79900,
        paymentMethod: 'CREDIT_CARD',
      },
    }),
  });

  const executeData = await executeRes.json();
  console.log('⚡ Response Status:', executeRes.status);
  console.log('📦 Result Data:', JSON.stringify(executeData, null, 2));

  // 3. Calling Typed RPC Method directly (/CreateOrder)
  console.log('\n🎯 Step 3: Calling Typed RPC Method (/CreateOrder)...');
  const orderRes = await fetch(`${BASE_URL}/${SERVICE}/CreateOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
    },
    body: JSON.stringify({
      item: 'AirPods Max USB-C',
      amount: 17900,
      paymentMethod: 'APPLE_PAY',
    }),
  });

  const orderData = await orderRes.json();
  console.log('⚡ Response Status:', orderRes.status);
  console.log('📦 Result Data:', JSON.stringify(orderData, null, 2));

  console.log('\n🎉 ConnectRPC Client invocation finished successfully!');
}

main().catch(console.error);
