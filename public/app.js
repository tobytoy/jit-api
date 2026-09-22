/**
 * JIT Protocol Synthesis Studio - Client Application
 */

// Application State
const state = {
  routes: [],
  selectedRoute: null,
  specs: [],
  activeSpecFile: null,
  activeContractLang: 'typescript',
  engineInfo: { engine: 'detecting', port: 3005 },
};

// DOM Elements
const elements = {
  // Navigation
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  routeCountBadge: document.getElementById('routeCountBadge'),
  serverStatusText: document.getElementById('serverStatusText'),
  engineStatusText: document.getElementById('engineStatusText'),
  globalRefreshBtn: document.getElementById('globalRefreshBtn'),

  // Stats
  statTotalRoutes: document.getElementById('statTotalRoutes'),
  statFrozenRoutes: document.getElementById('statFrozenRoutes'),
  statObservingRoutes: document.getElementById('statObservingRoutes'),

  // Routes & Playground
  routeCardsContainer: document.getElementById('routeCardsContainer'),
  requestPayloadInput: document.getElementById('requestPayloadInput'),
  responsePayloadOutput: document.getElementById('responsePayloadOutput'),
  sendRequestBtn: document.getElementById('sendRequestBtn'),
  formatJsonBtn: document.getElementById('formatJsonBtn'),
  presetSemanticBtn: document.getElementById('presetSemanticBtn'),
  presetStableBtn: document.getElementById('presetStableBtn'),
  presetDriftBtn: document.getElementById('presetDriftBtn'),
  respPhaseBadge: document.getElementById('respPhaseBadge'),
  respLatencyBadge: document.getElementById('respLatencyBadge'),
  respAiLatencyBadge: document.getElementById('respAiLatencyBadge'),

  // Benchmark
  scenarioOptions: document.querySelectorAll('.scenario-option'),
  vusSlider: document.getElementById('vusSlider'),
  vusVal: document.getElementById('vusVal'),
  durationSlider: document.getElementById('durationSlider'),
  durationVal: document.getElementById('durationVal'),
  runK6Btn: document.getElementById('runK6Btn'),
  runK6BtnText: document.getElementById('runK6BtnText'),
  benchResultsSection: document.getElementById('benchResultsSection'),
  bannerTitle: document.getElementById('bannerTitle'),
  bannerSubtitle: document.getElementById('bannerSubtitle'),
  metricRps: document.getElementById('metricRps'),
  metricAvg: document.getElementById('metricAvg'),
  metricP95: document.getElementById('metricP95'),
  metricSuccess: document.getElementById('metricSuccess'),
  valMin: document.getElementById('valMin'),
  valMed: document.getElementById('valMed'),
  valP90: document.getElementById('valP90'),
  valP95: document.getElementById('valP95'),
  valP99: document.getElementById('valP99'),
  valMax: document.getElementById('valMax'),
  rawK6Output: document.getElementById('rawK6Output'),

  // Specs
  specFileList: document.getElementById('specFileList'),
  newSpecBtn: document.getElementById('newSpecBtn'),
  activeSpecFilename: document.getElementById('activeSpecFilename'),
  specContentEditor: document.getElementById('specContentEditor'),
  saveSpecBtn: document.getElementById('saveSpecBtn'),
  reloadSpecsBtn: document.getElementById('reloadSpecsBtn'),

  // Contracts
  langTabs: document.querySelectorAll('.lang-tab'),
  contractFilePath: document.getElementById('contractFilePath'),
  contractCodeView: document.getElementById('contractCodeView'),
  copyContractBtn: document.getElementById('copyContractBtn'),
};

// ================= Initialization =================
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSliders();
  setupScenarioSelector();
  setupPresets();
  setupEventHandlers();

  // Initial Data Load
  refreshAll();
  loadDefaultPayload();
});

// ================= Tab Navigation =================
function setupTabs() {
  elements.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      elements.tabButtons.forEach((b) => b.classList.remove('active'));
      elements.tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');

      if (targetTab === 'tab-specs' && state.specs.length > 0 && !state.activeSpecFile) {
        selectSpec(state.specs[0].filename);
      } else if (targetTab === 'tab-contracts') {
        loadContractCode(state.activeContractLang);
      }
    });
  });
}

// ================= Sliders & Options =================
function setupSliders() {
  elements.vusSlider.addEventListener('input', (e) => {
    elements.vusVal.textContent = `${e.target.value} VUs`;
  });

  elements.durationSlider.addEventListener('input', (e) => {
    elements.durationVal.textContent = `${e.target.value} 秒`;
  });
}

function setupScenarioSelector() {
  elements.scenarioOptions.forEach((option) => {
    option.addEventListener('click', () => {
      elements.scenarioOptions.forEach((o) => o.classList.remove('selected'));
      option.classList.add('selected');
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
}

// ================= Presets =================
function setupPresets() {
  elements.presetSemanticBtn.addEventListener('click', () => {
    elements.requestPayloadInput.value = JSON.stringify(
      {
        message: '我想訂購一台頂配 MacBook Pro 筆電，刷信用卡，金額是 89000 元',
        item: 'MacBook Pro M4 Max',
        amount: 89000,
      },
      null,
      2
    );
  });

  elements.presetStableBtn.addEventListener('click', () => {
    const route = state.selectedRoute || 'create_order';
    elements.requestPayloadInput.value = JSON.stringify(
      {
        route: route,
        item: '極速電競機械鍵盤',
        amount: 3200,
        paymentMethod: 'LINE_PAY',
      },
      null,
      2
    );
  });

  elements.presetDriftBtn.addEventListener('click', () => {
    elements.requestPayloadInput.value = JSON.stringify(
      {
        route: 'create_order',
        item: '限量旗艦電競主機',
        amount: 'NOT_A_FLOAT', // triggers drift fallback
        couponCode: 'VIP_DISCOUNT_2026',
        paymentMethod: 'CREDIT_CARD',
      },
      null,
      2
    );
  });

  elements.formatJsonBtn.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(elements.requestPayloadInput.value);
      elements.requestPayloadInput.value = JSON.stringify(parsed, null, 2);
    } catch {
      alert('無效的 JSON 格式！');
    }
  });
}

function loadDefaultPayload() {
  elements.requestPayloadInput.value = JSON.stringify(
    {
      message: '我想訂購一台 Sony Alpha 相機，刷信用卡，金額是 42000 元',
      item: 'Sony Alpha 7',
      amount: 42000,
    },
    null,
    2
  );
}

// ================= Event Handlers =================
function setupEventHandlers() {
  elements.globalRefreshBtn.addEventListener('click', () => {
    refreshAll();
  });

  elements.sendRequestBtn.addEventListener('click', sendTestRequest);
  elements.runK6Btn.addEventListener('click', runK6Benchmark);

  // Specs
  elements.saveSpecBtn.addEventListener('click', saveActiveSpec);
  elements.reloadSpecsBtn.addEventListener('click', reloadAllSpecs);
  elements.newSpecBtn.addEventListener('click', createNewSpecPrompt);

  // Contracts
  elements.langTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      elements.langTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeContractLang = tab.getAttribute('data-lang');
      loadContractCode(state.activeContractLang);
    });
  });

  elements.copyContractBtn.addEventListener('click', () => {
    const text = elements.contractCodeView.textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert('已成功複製合約代碼至剪貼簿！');
    });
  });
}

// ================= Data Loading & Rendering =================
async function refreshAll() {
  await Promise.all([loadRoutes(), loadSpecs(), checkServerInfo()]);
}

async function checkServerInfo() {
  try {
    const resp = await fetch('/api/info');
    if (resp.ok) {
      const data = await resp.json();
      state.engineInfo = data;
      elements.serverStatusText.textContent = `Server: Online (${data.port || 3005})`;
      elements.engineStatusText.textContent = `Engine: ${data.engine === 'typesafe' ? 'TypeSafe Jev (Cloud)' : 'Needle (Local)'}`;
    }
  } catch {
    elements.serverStatusText.textContent = 'Server: Offline';
  }
}

async function loadRoutes() {
  try {
    const resp = await fetch('/api/routes');
    if (!resp.ok) throw new Error('Failed to fetch routes');
    const routes = await resp.json();
    state.routes = routes;

    // Update stats
    elements.statTotalRoutes.textContent = routes.length;
    elements.routeCountBadge.textContent = routes.length;

    let frozenCount = 0;
    let observingCount = 0;

    routes.forEach((r) => {
      if (r.status?.isFrozen) frozenCount++;
      else observingCount++;
    });

    elements.statFrozenRoutes.textContent = frozenCount;
    elements.statObservingRoutes.textContent = observingCount;

    renderRouteCards(routes);
  } catch (err) {
    elements.routeCardsContainer.innerHTML = `<div class="error-state">無法載入路由清單: ${err.message}</div>`;
  }
}

function renderRouteCards(routes) {
  if (routes.length === 0) {
    elements.routeCardsContainer.innerHTML = '<div class="empty-state">尚未註冊任何路由端點</div>';
    return;
  }

  elements.routeCardsContainer.innerHTML = routes
    .map((r) => {
      const isFrozen = r.status?.isFrozen || false;
      const count = r.status?.metrics?.count || 0;
      const threshold = r.status?.metrics?.threshold || 3;
      const pct = isFrozen ? 100 : Math.min(100, Math.round((count / threshold) * 100));

      let badgeClass = 'badge-phase1';
      let badgeLabel = 'Phase 1 Dynamic';

      if (isFrozen) {
        badgeClass = 'badge-phase3';
        badgeLabel = 'Phase 3 Frozen (0ms)';
      } else if (count > 0) {
        badgeClass = 'badge-phase2';
        badgeLabel = `Phase 2 Observing (${count}/${threshold})`;
      }

      return `
        <div class="route-card ${state.selectedRoute === r.route ? 'selected' : ''}" data-route="${r.route}">
          <div class="card-top">
            <span class="card-route-name">${r.route}</span>
            <span class="badge-phase ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="card-desc">${r.description || '無描述'}</div>
          <div class="card-meta-row">
            <span>意圖標記: ${r.intentCriteria ? r.intentCriteria.substring(0, 35) + '...' : '自動判定'}</span>
            <span>穩定度: ${pct}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');

  // Attach click events
  document.querySelectorAll('.route-card').forEach((card) => {
    card.addEventListener('click', () => {
      const route = card.getAttribute('data-route');
      selectRoute(route);
    });
  });
}

function selectRoute(route) {
  state.selectedRoute = route;
  document.querySelectorAll('.route-card').forEach((c) => {
    c.classList.toggle('selected', c.getAttribute('data-route') === route);
  });

  // Prefill stable preset for this route
  elements.requestPayloadInput.value = JSON.stringify(
    {
      route: route,
      item: '精選旗艦商品',
      amount: 4500,
      paymentMethod: 'LINE_PAY',
    },
    null,
    2
  );
}

// ================= Interactive Request Sender =================
async function sendTestRequest() {
  const rawInput = elements.requestPayloadInput.value.trim();
  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    alert('Payload 必須為有效的 JSON！');
    return;
  }

  elements.sendRequestBtn.disabled = true;
  elements.sendRequestBtn.innerHTML = '<span>⏳ 處理中...</span>';
  elements.responsePayloadOutput.textContent = '發送請求中，正在執行語意協商/靜態驗證...';

  const startTime = performance.now();

  try {
    const resp = await fetch('/api/jit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const elapsed = Math.round(performance.now() - startTime);
    const body = await resp.json();

    elements.responsePayloadOutput.textContent = JSON.stringify(body, null, 2);

    // Update badges
    const ctx = body.context || {};
    elements.respPhaseBadge.textContent = `Phase: ${ctx.phase || (body.phase ? body.phase : 'N/A')}`;
    elements.respLatencyBadge.textContent = `Time: ${elapsed}ms`;
    elements.respAiLatencyBadge.textContent = `AI Latency: ${ctx.aiLatencyMs !== undefined ? ctx.aiLatencyMs + 'ms' : (ctx.ai_latency_ms !== undefined ? ctx.ai_latency_ms + 'ms' : '0ms')}`;

    // Refresh route cards to reflect new stability count or freeze state
    setTimeout(loadRoutes, 300);
  } catch (err) {
    elements.responsePayloadOutput.textContent = `連線失敗: ${err.message}`;
  } finally {
    elements.sendRequestBtn.disabled = false;
    elements.sendRequestBtn.innerHTML = '<span>🚀 發送請求</span>';
  }
}

// ================= k6 Load Test Runner =================
async function runK6Benchmark() {
  const selectedScenario = document.querySelector('input[name="benchMode"]:checked')?.value || 'phase3';
  const vus = parseInt(elements.vusSlider.value, 10);
  const duration = `${elements.durationSlider.value}s`;

  elements.runK6Btn.disabled = true;
  elements.runK6BtnText.textContent = `⚡ Grafana k6 壓測中 (${vus} VUs, ${duration})...`;
  elements.benchResultsSection.style.display = 'none';

  try {
    const resp = await fetch('/api/bench/k6', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: selectedScenario,
        vus: vus,
        duration: duration,
      }),
    });

    if (!resp.ok) {
      throw new Error(`壓測失敗 (${resp.status}): ${await resp.text()}`);
    }

    const data = await resp.json();
    renderBenchmarkResults(data);
  } catch (err) {
    alert(`執行壓測時發生錯誤: ${err.message}`);
  } finally {
    elements.runK6Btn.disabled = false;
    elements.runK6BtnText.textContent = '開始執行一鍵壓力測試';
  }
}

function renderBenchmarkResults(data) {
  elements.benchResultsSection.style.display = 'block';

  // Highlight Banner
  if (data.mode === 'phase3') {
    elements.bannerTitle.textContent = '⚡ Phase 3 靜態 Fast-Path 達成微秒級極限吞吐！';
    elements.bannerSubtitle.textContent = `0 毫秒 AI 延遲，RPS 達到了 ${data.rps} req/sec，P95 延遲僅 ${data.latency.p95}ms！`;
  } else {
    elements.bannerTitle.textContent = '🧠 Phase 1 動態語意路由壓測完成';
    elements.bannerSubtitle.textContent = `端側模型毫秒級推論正常承載，成功率 ${Math.round(data.successRate * 100)}%！`;
  }

  // Key Metrics
  elements.metricRps.textContent = Number(data.rps).toLocaleString();
  elements.metricAvg.textContent = `${data.latency.avg}ms`;
  elements.metricP95.textContent = `${data.latency.p95}ms`;
  elements.metricSuccess.textContent = `${Math.round(data.successRate * 100)}%`;

  // Percentiles
  elements.valMin.textContent = `${data.latency.min}ms`;
  elements.valMed.textContent = `${data.latency.med}ms`;
  elements.valP90.textContent = `${data.latency.p90}ms`;
  elements.valP95.textContent = `${data.latency.p95}ms`;
  elements.valP99.textContent = `${data.latency.p99}ms`;
  elements.valMax.textContent = `${data.latency.max}ms`;

  // Raw Console Output
  elements.rawK6Output.textContent = data.rawOutput || '壓測由內嵌高並發 Runner 順利完成。';

  // Smooth scroll down to results
  elements.benchResultsSection.scrollIntoView({ behavior: 'smooth' });
}

// ================= Specs Management =================
async function loadSpecs() {
  try {
    const resp = await fetch('/api/specs');
    if (!resp.ok) return;
    const specs = await resp.json();
    state.specs = specs;

    if (specs.length === 0) {
      elements.specFileList.innerHTML = '<div class="empty-state">尚無規格檔案</div>';
      return;
    }

    elements.specFileList.innerHTML = specs
      .map(
        (s) => `
        <div class="spec-item ${state.activeSpecFile === s.filename ? 'active' : ''}" data-file="${s.filename}">
          <div class="spec-filename">${s.filename}</div>
          <div class="spec-route-tag">API: ${s.route} (${s.fieldsCount} 個欄位)</div>
        </div>
      `
      )
      .join('');

    document.querySelectorAll('.spec-item').forEach((item) => {
      item.addEventListener('click', () => {
        const file = item.getAttribute('data-file');
        selectSpec(file);
      });
    });
  } catch (err) {
    elements.specFileList.innerHTML = `<div class="error-state">讀取失敗: ${err.message}</div>`;
  }
}

async function selectSpec(filename) {
  state.activeSpecFile = filename;
  elements.activeSpecFilename.textContent = filename;

  document.querySelectorAll('.spec-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('data-file') === filename);
  });

  try {
    const resp = await fetch(`/api/specs/${filename}`);
    if (resp.ok) {
      const content = await resp.text();
      elements.specContentEditor.value = content;
    }
  } catch (err) {
    elements.specContentEditor.value = `# 載入錯誤: ${err.message}`;
  }
}

async function saveActiveSpec() {
  if (!state.activeSpecFile) {
    alert('請先選取欲儲存的規格檔案！');
    return;
  }

  const content = elements.specContentEditor.value;
  try {
    const resp = await fetch(`/api/specs/${state.activeSpecFile}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    });

    if (resp.ok) {
      alert(`✅ 規格 ${state.activeSpecFile} 已成功儲存！`);
      loadSpecs();
    } else {
      alert('儲存失敗');
    }
  } catch (err) {
    alert(`儲存失敗: ${err.message}`);
  }
}

async function reloadAllSpecs() {
  try {
    const resp = await fetch('/api/specs/reload', { method: 'POST' });
    if (resp.ok) {
      alert('⚡ 已成功熱重載所有 Markdown API 規格！');
      refreshAll();
    }
  } catch (err) {
    alert(`熱重載失敗: ${err.message}`);
  }
}

function createNewSpecPrompt() {
  const name = prompt('請輸入新 API 路由名稱 (例: user_profile):');
  if (!name) return;

  const filename = `${name}.api.md`;
  const template = `# API: ${name}
> 請填寫業務簡述

## Intent
User wants to ...

## Fields
- field1: string (欄位說明)
- field2: number (數值欄位)

## Logic
\`\`\`javascript
return {
  status: "SUCCESS",
  route: "${name}",
  payload: payload
};
\`\`\`
`;

  fetch(`/api/specs/${filename}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: template,
  }).then(() => {
    loadSpecs().then(() => selectSpec(filename));
  });
}

// ================= Contracts Tab =================
async function loadContractCode(lang) {
  const langPaths = {
    typescript: 'generated/typescript/create_order.ts',
    python: 'generated/python/create_order.py',
    golang: 'generated/proto/create_order.proto',
  };

  elements.contractFilePath.textContent = langPaths[lang] || 'generated/contract';
  elements.contractCodeView.textContent = '讀取合約代碼中...';

  try {
    const resp = await fetch(`/api/contracts?lang=${lang}`);
    if (resp.ok) {
      const code = await resp.text();
      elements.contractCodeView.textContent = code;
    } else {
      elements.contractCodeView.textContent = '// 尚未觸發凍結，或該語言合約尚未生成。\n// 請在「路由觀測」分頁發送 3 次相同請求觸發凍結！';
    }
  } catch (err) {
    elements.contractCodeView.textContent = `// 讀取錯誤: ${err.message}`;
  }
}
