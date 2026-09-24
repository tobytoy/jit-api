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
  currentRole: 'overview',
  coordination: { routes: [], locks: [] },
  trafficMode: 'valid',
  trafficCount: 5,
  clientSdkLang: 'typescript',
  lineConfig: null,
  whitelist: [],
  tickets: [],
  ticketFilter: 'ALL',
  masterAuth: {
    authenticated: false,
    token: localStorage.getItem('jit_master_token') || '',
    requiresLogin: false,
    role: 'guest',
  },
  upstreamSecrets: [],
  tenants: [],
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

  // Master Auth & Modal
  masterAuthPill: document.getElementById('masterAuthPill'),
  masterAuthIcon: document.getElementById('masterAuthIcon'),
  masterAuthText: document.getElementById('masterAuthText'),
  masterLoginModal: document.getElementById('masterLoginModal'),
  masterPasswordInput: document.getElementById('masterPasswordInput'),
  masterLoginAlert: document.getElementById('masterLoginAlert'),
  closeMasterModalBtn: document.getElementById('closeMasterModalBtn'),
  cancelMasterModalBtn: document.getElementById('cancelMasterModalBtn'),
  submitMasterLoginBtn: document.getElementById('submitMasterLoginBtn'),

  // Role & Coordination
  roleButtons: document.querySelectorAll('.role-btn'),
  viewOverview: document.getElementById('viewOverview'),
  viewClient: document.getElementById('viewClient'),
  viewServer: document.getElementById('viewServer'),
  viewLine: document.getElementById('viewLine'),
  viewUpstream: document.getElementById('viewUpstream'),
  roleUpstreamBtn: document.getElementById('roleUpstreamBtn'),
  globalTrafficDot: document.getElementById('globalTrafficDot'),
  globalCoordinationText: document.getElementById('globalCoordinationText'),

  // Upstream & Tenant Elements
  upstreamSecretsContainer: document.getElementById('upstreamSecretsContainer'),
  newSecretRef: document.getElementById('newSecretRef'),
  newSecretVal: document.getElementById('newSecretVal'),
  saveSecretBtn: document.getElementById('saveSecretBtn'),
  tenantsTableBody: document.getElementById('tenantsTableBody'),
  newTenantName: document.getElementById('newTenantName'),
  newTenantRole: document.getElementById('newTenantRole'),
  newTenantRoutes: document.getElementById('newTenantRoutes'),
  newTenantRate: document.getElementById('newTenantRate'),
  createTenantBtn: document.getElementById('createTenantBtn'),
  newWhitelistApis: document.getElementById('newWhitelistApis'),
  newWhitelistCompany: document.getElementById('newWhitelistCompany'),

  // Client Workspace Elements
  clientTrafficPill: document.getElementById('clientTrafficPill'),
  clientTrafficDot: document.getElementById('clientTrafficDot'),
  clientTrafficText: document.getElementById('clientTrafficText'),
  clientAcquireLockBtn: document.getElementById('clientAcquireLockBtn'),
  clientReleaseLockBtn: document.getElementById('clientReleaseLockBtn'),
  clientRouteSelect: document.getElementById('clientRouteSelect'),
  optMockFast: document.getElementById('optMockFast'),
  optMockLive: document.getElementById('optMockLive'),
  clientMockBadge: document.getElementById('clientMockBadge'),
  btnTrafficValid: document.getElementById('btnTrafficValid'),
  btnTrafficFuzz: document.getElementById('btnTrafficFuzz'),
  btnTrafficChaos: document.getElementById('btnTrafficChaos'),
  trafficCountSlider: document.getElementById('trafficCountSlider'),
  trafficCountVal: document.getElementById('trafficCountVal'),
  runTrafficBtn: document.getElementById('runTrafficBtn'),
  trafficResultBox: document.getElementById('trafficResultBox'),
  trafTotal: document.getElementById('trafTotal'),
  trafSuccess: document.getElementById('trafSuccess'),
  trafRepaired: document.getElementById('trafRepaired'),
  trafLatency: document.getElementById('trafLatency'),
  trafficLogView: document.getElementById('trafficLogView'),
  clientEndpointInput: document.getElementById('clientEndpointInput'),
  clientPayloadInput: document.getElementById('clientPayloadInput'),
  clientSendBtn: document.getElementById('clientSendBtn'),
  clientFormatJsonBtn: document.getElementById('clientFormatJsonBtn'),
  clientPresetSemantic: document.getElementById('clientPresetSemantic'),
  clientPresetStable: document.getElementById('clientPresetStable'),
  clientPresetDrift: document.getElementById('clientPresetDrift'),
  clientRespPhase: document.getElementById('clientRespPhase'),
  clientRespLatency: document.getElementById('clientRespLatency'),
  clientRespAiLatency: document.getElementById('clientRespAiLatency'),
  clientResponseOutput: document.getElementById('clientResponseOutput'),
  btnSdkTs: document.getElementById('btnSdkTs'),
  btnSdkPy: document.getElementById('btnSdkPy'),
  btnSdkConnect: document.getElementById('btnSdkConnect'),
  clientSdkFilename: document.getElementById('clientSdkFilename'),
  clientSdkCodeView: document.getElementById('clientSdkCodeView'),
  copyClientSdkBtn: document.getElementById('copyClientSdkBtn'),

  // Server Workspace Elements
  serverTrafficPill: document.getElementById('serverTrafficPill'),
  serverTrafficDot: document.getElementById('serverTrafficDot'),
  serverTrafficText: document.getElementById('serverTrafficText'),
  serverAcquireLockBtn: document.getElementById('serverAcquireLockBtn'),
  serverReleaseLockBtn: document.getElementById('serverReleaseLockBtn'),
  serverRouteSelect: document.getElementById('serverRouteSelect'),
  serverPhaseBadge: document.getElementById('serverPhaseBadge'),
  serverSampleProgress: document.getElementById('serverSampleProgress'),
  serverFreezeBtn: document.getElementById('serverFreezeBtn'),
  serverUnfreezeBtn: document.getElementById('serverUnfreezeBtn'),
  serverSpecFileList: document.getElementById('serverSpecFileList'),
  serverReloadSpecsBtn: document.getElementById('serverReloadSpecsBtn'),
  serverActiveSpecName: document.getElementById('serverActiveSpecName'),
  serverSpecEditor: document.getElementById('serverSpecEditor'),
  serverSaveSpecBtn: document.getElementById('serverSaveSpecBtn'),
  serverVusSlider: document.getElementById('serverVusSlider'),
  serverVusVal: document.getElementById('serverVusVal'),
  serverDurationSlider: document.getElementById('serverDurationSlider'),
  serverDurationVal: document.getElementById('serverDurationVal'),
  serverRunK6Btn: document.getElementById('serverRunK6Btn'),
  serverBenchResultBox: document.getElementById('serverBenchResultBox'),
  srvRps: document.getElementById('srvRps'),
  srvAvg: document.getElementById('srvAvg'),
  srvP95: document.getElementById('srvP95'),
  srvSuccess: document.getElementById('srvSuccess'),
  serverReleaseVersionInput: document.getElementById('serverReleaseVersionInput'),
  serverSnapshotBtn: document.getElementById('serverSnapshotBtn'),
  serverRollbackSelect: document.getElementById('serverRollbackSelect'),
  serverRollbackBtn: document.getElementById('serverRollbackBtn'),

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
  benchTargetRouteSelect: document.getElementById('benchTargetRouteSelect'),
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

  // LINE Control Center Elements
  lineBotStatusText: document.getElementById('lineBotStatusText'),
  linePendingTicketsCount: document.getElementById('linePendingTicketsCount'),
  lineWhitelistCount: document.getElementById('lineWhitelistCount'),
  lineCredBadge: document.getElementById('lineCredBadge'),
  lineChannelSecretInput: document.getElementById('lineChannelSecretInput'),
  lineAccessTokenInput: document.getElementById('lineAccessTokenInput'),
  lineWebhookUrlInput: document.getElementById('lineWebhookUrlInput'),
  copyWebhookUrlBtn: document.getElementById('copyWebhookUrlBtn'),
  saveLineConfigBtn: document.getElementById('saveLineConfigBtn'),
  whitelistBadge: document.getElementById('whitelistBadge'),
  whitelistContainer: document.getElementById('whitelistContainer'),
  newWhitelistId: document.getElementById('newWhitelistId'),
  newWhitelistName: document.getElementById('newWhitelistName'),
  newWhitelistRole: document.getElementById('newWhitelistRole'),
  addWhitelistBtn: document.getElementById('addWhitelistBtn'),
  ticketCountBadge: document.getElementById('ticketCountBadge'),
  ticketCardsContainer: document.getElementById('ticketCardsContainer'),
  ticketFilterChips: document.querySelectorAll('.ticket-filter-group .filter-chip'),
  simulatedUserSelect: document.getElementById('simulatedUserSelect'),
  chatSimulatorBody: document.getElementById('chatSimulatorBody'),
  chatSimulatorInput: document.getElementById('chatSimulatorInput'),
  chatSimulatorSendBtn: document.getElementById('chatSimulatorSendBtn'),
  chatShortcutChips: document.querySelectorAll('.shortcut-chip'),
};

/**
 * Robust JSON Fetch helper that injects Master Auth token and prevents parsing errors
 */
async function safeApiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.masterAuth && state.masterAuth.token) {
    headers['Authorization'] = `Bearer ${state.masterAuth.token}`;
    headers['x-master-token'] = state.masterAuth.token;
  }

  const resp = await fetch(url, { ...options, headers });
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await resp.text();
    if (resp.status === 404) {
      throw new Error(`伺服器尚未載入端點 (HTTP 404)。若剛更新代碼，請確認已重啟 ./run.sh`);
    }
    throw new Error(`伺服器回應非 JSON 格式 (HTTP ${resp.status}): ${text.slice(0, 100)}`);
  }
  const data = await resp.json();

  if (resp.status === 401 && data?.requiresLogin) {
    showMasterLoginModal();
  }

  return { ok: resp.ok, status: resp.status, data };
}

// ================= Initialization =================
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupSliders();
  setupScenarioSelector();
  setupPresets();
  setupEventHandlers();

  // Role Switcher & Workspaces
  setupRoleSwitcher();
  setupClientWorkspace();
  setupServerWorkspace();
  setupLineWorkspace();
  setupUpstreamWorkspace();
  setupMasterAuth();

  // Initial Data Load
  loadDefaultPayload();
  await refreshAll();
  await fetchAuthStatus();

  // Poll coordination status and tickets every 3.5s
  setInterval(() => {
    fetchCoordinationStatus();
    if (state.currentRole === 'line') {
      fetchTickets();
    } else if (state.currentRole === 'upstream') {
      fetchUpstreamSecrets();
      fetchTenants();
    }
  }, 3500);

  // Initialize terminal only if server is not in production mode
  if (state.engineInfo && state.engineInfo.mode === 'prod') {
    applyProdModeRestrictions();
  } else {
    setupWebTerminal();
  }
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
    const route = state.selectedRoute || (state.routes[0] ? state.routes[0].route : 'create_order');
    const r = state.routes.find((x) => x.route === route);
    const semantic = (r && r.sampleSemantic) ? r.sampleSemantic : `我想執行 ${route} 業務操作`;
    const sample = (r && r.samplePayload) ? r.samplePayload : {};
    elements.requestPayloadInput.value = JSON.stringify(
      {
        message: semantic,
        ...sample,
      },
      null,
      2
    );
  });

  elements.presetStableBtn.addEventListener('click', () => {
    const route = state.selectedRoute || (state.routes[0] ? state.routes[0].route : 'create_order');
    const r = state.routes.find((x) => x.route === route);
    const sample = (r && r.samplePayload) ? r.samplePayload : {};
    elements.requestPayloadInput.value = JSON.stringify(
      {
        route: route,
        ...sample,
      },
      null,
      2
    );
  });

  elements.presetDriftBtn.addEventListener('click', () => {
    const route = state.selectedRoute || (state.routes[0] ? state.routes[0].route : 'create_order');
    const r = state.routes.find((x) => x.route === route);
    const sample = (r && r.samplePayload) ? { ...r.samplePayload } : {};
    sample._driftTag = 'VIP_DRIFT_' + Date.now();
    elements.requestPayloadInput.value = JSON.stringify(
      {
        route: route,
        ...sample,
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
  if (state.routes && state.routes.length > 0) {
    selectRoute(state.routes[0].route);
  } else {
    elements.requestPayloadInput.value = JSON.stringify(
      {
        route: 'ping',
        client: 'dashboard-user',
      },
      null,
      2
    );
  }
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
      const isProdMode = data.mode === 'prod';
      elements.serverStatusText.textContent = isProdMode
        ? `Server: Online (${data.port || 3000}) 🔒 PROD`
        : `Server: Online (${data.port || 3005}) [DEV]`;
      elements.engineStatusText.textContent = `Engine: ${data.engine === 'typesafe' ? 'TypeSafe Jev (Cloud)' : 'Needle (Local)'}`;

      if (isProdMode) {
        applyProdModeRestrictions();
      }
    }
  } catch {
    elements.serverStatusText.textContent = 'Server: Offline';
  }
}

function applyProdModeRestrictions() {
  // Hide terminal drawer and close any existing WS
  const drawer = document.getElementById('terminalDrawer');
  if (drawer) {
    drawer.style.display = 'none';
  }
  if (termWs) {
    try {
      termWs.onclose = null;
      termWs.close();
    } catch {}
    termWs = null;
  }

  // Lock spec editing
  if (elements.saveSpecBtn) {
    elements.saveSpecBtn.disabled = true;
    elements.saveSpecBtn.style.opacity = '0.45';
    elements.saveSpecBtn.style.cursor = 'not-allowed';
    elements.saveSpecBtn.title = '🔒 生產模式下規格已鎖定，禁止線上編輯！';
  }
  if (elements.newSpecBtn) {
    elements.newSpecBtn.style.display = 'none';
  }
  if (elements.specContentEditor) {
    elements.specContentEditor.setAttribute('readonly', 'true');
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

    // Update target route select in benchmark tab
    if (elements.benchTargetRouteSelect) {
      const currentVal = elements.benchTargetRouteSelect.value;
      elements.benchTargetRouteSelect.innerHTML = routes
        .map((r) => `<option value="${r.route}">${r.route} [${r.stage === 'prod' ? 'PROD' : 'DEV'}] (${r.description || '無描述'})</option>`)
        .join('');
      if (currentVal && routes.some((r) => r.route === currentVal)) {
        elements.benchTargetRouteSelect.value = currentVal;
      } else if (state.selectedRoute) {
        elements.benchTargetRouteSelect.value = state.selectedRoute;
      }
    }

    // Populate Client and Server route selectors
    if (elements.clientRouteSelect) {
      elements.clientRouteSelect.innerHTML = routes
        .map((r) => {
          const color = r.status?.trafficLight?.color || (r.status?.isFrozen ? 'GREEN' : 'GREEN');
          const icon = color === 'RED' ? '🔴' : color === 'YELLOW' ? '🟡' : '🟢';
          return `<option value="${r.route}">${icon} ${r.route} (${r.description || '無描述'})</option>`;
        })
        .join('');
      if (state.selectedRoute) elements.clientRouteSelect.value = state.selectedRoute;
    }

    if (elements.serverRouteSelect) {
      elements.serverRouteSelect.innerHTML = routes
        .map((r) => {
          const color = r.status?.trafficLight?.color || (r.status?.isFrozen ? 'GREEN' : 'GREEN');
          const icon = color === 'RED' ? '🔴' : color === 'YELLOW' ? '🟡' : '🟢';
          return `<option value="${r.route}">${icon} ${r.route} [${r.stage === 'prod' ? 'PROD' : 'DEV'}]</option>`;
        })
        .join('');
      if (state.selectedRoute) elements.serverRouteSelect.value = state.selectedRoute;
    }

    renderRouteCards(routes);

    // If no route selected yet, select first route
    if (!state.selectedRoute && routes.length > 0) {
      selectRoute(routes[0].route);
    } else if (state.selectedRoute) {
      selectRoute(state.selectedRoute);
    }
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

      const stageBadgeClass = r.stage === 'prod' ? 'badge-stage-prod' : 'badge-stage-dev';
      const stageLabel = r.stage === 'prod' ? 'PROD' : 'DEV';

      // Real-time Traffic Light Pill on Route Card
      const tl = r.status?.trafficLight;
      const tlColor = tl?.color || (isFrozen ? 'GREEN' : 'GREEN');
      const tlIcon = tlColor === 'RED' ? '🔴' : tlColor === 'YELLOW' ? '🟡' : '🟢';
      const tlBadgeClass = tlColor === 'RED' ? 'badge-red' : tlColor === 'YELLOW' ? 'badge-yellow' : 'badge-green';

      return `
        <div class="route-card ${state.selectedRoute === r.route ? 'selected' : ''}" data-route="${r.route}">
          <div class="card-top">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="card-route-name">${r.route}</span>
              <span class="badge-version">v${r.version || '1.0.0'}</span>
              <span class="${stageBadgeClass}">${stageLabel}</span>
              <span class="route-traffic-badge ${tlBadgeClass}" title="${tl?.description || ''}">
                ${tlIcon} ${tlColor}
              </span>
            </div>
            <span class="badge-phase ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="card-desc">${r.description || '無描述'}</div>
          <div class="card-meta-row">
            <span>意圖標記: ${r.intentCriteria ? r.intentCriteria.substring(0, 24) + '...' : '自動判定'}</span>
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

  if (elements.benchTargetRouteSelect) {
    elements.benchTargetRouteSelect.value = route;
  }
  if (elements.clientRouteSelect) {
    elements.clientRouteSelect.value = route;
  }
  if (elements.serverRouteSelect) {
    elements.serverRouteSelect.value = route;
  }

  const r = state.routes.find((x) => x.route === route);
  const sample = (r && r.samplePayload) ? r.samplePayload : {};

  // Prefill dynamic sample preset for this route
  elements.requestPayloadInput.value = JSON.stringify(
    {
      route: route,
      ...sample,
    },
    null,
    2
  );

  updateClientWorkspace();
  updateServerWorkspace();
  if (r?.status?.trafficLight) {
    updateRouteTrafficLightUI(r.status.trafficLight);
  }
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
  const targetRouteName = elements.benchTargetRouteSelect ? elements.benchTargetRouteSelect.value : state.selectedRoute;
  const targetRouteObj = state.routes.find((r) => r.route === targetRouteName) || state.routes[0];
  const targetRoute = targetRouteObj ? targetRouteObj.route : 'create_order';
  const samplePayload = targetRouteObj ? targetRouteObj.samplePayload : undefined;
  const sampleSemantic = targetRouteObj ? targetRouteObj.sampleSemantic : undefined;

  const vus = parseInt(elements.vusSlider.value, 10);
  const duration = `${elements.durationSlider.value}s`;

  elements.runK6Btn.disabled = true;
  elements.runK6BtnText.textContent = `⚡ Grafana k6 壓測中 [${targetRoute}] (${vus} VUs, ${duration})...`;
  elements.benchResultsSection.style.display = 'none';

  try {
    const resp = await fetch('/api/bench/k6', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: selectedScenario,
        vus: vus,
        duration: duration,
        targetRoute,
        samplePayload,
        sampleSemantic,
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

// ================= Integrated Web Terminal (VSCode Style) =================
let term = null;
let fitAddon = null;
let termWs = null;
let isTerminalCollapsed = false;

function setupWebTerminal() {
  if (state.engineInfo && state.engineInfo.mode === 'prod') {
    applyProdModeRestrictions();
    return;
  }

  if (typeof window.Terminal === 'undefined') {
    console.warn('[Web Terminal] xterm.js not loaded, terminal disabled.');
    return;
  }

  term = new window.Terminal({
    cursorBlink: true,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.25,
    convertEol: true,
    theme: {
      background: '#070a13',
      foreground: '#f8fafc',
      cursor: '#6366f1',
      cursorAccent: '#ffffff',
      selectionBackground: 'rgba(99, 102, 241, 0.35)',
      black: '#0f172a',
      red: '#f43f5e',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#38bdf8',
      magenta: '#c084fc',
      cyan: '#2dd4bf',
      white: '#f1f5f9',
      brightBlack: '#475569',
      brightRed: '#fb7185',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#d8b4fe',
      brightCyan: '#5eead4',
      brightWhite: '#ffffff',
    },
  });

  if (window.FitAddon && window.FitAddon.FitAddon) {
    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
  }

  const container = document.getElementById('terminalContainer');
  if (container) {
    term.open(container);
    if (fitAddon) {
      setTimeout(() => fitAddon.fit(), 150);
    }
  }

  connectTerminalWebSocket();

  // Resize handler
  window.addEventListener('resize', () => {
    if (fitAddon && !isTerminalCollapsed) {
      fitAddon.fit();
      sendResize();
    }
  });

  // Keyboard shortcut: Ctrl + ` (backtick) or Cmd + `
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === '~')) {
      e.preventDefault();
      toggleTerminal();
    }
  });

  // Header click to toggle
  document.getElementById('terminalHeader')?.addEventListener('click', (e) => {
    if (!e.target.closest('.terminal-quick-actions')) {
      toggleTerminal();
    }
  });

  document.getElementById('termToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTerminal();
  });

  // Quick Action Buttons
  document.getElementById('termCmdTestBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureTerminalOpen();
    sendTerminalInput('npm test\n');
  });

  document.getElementById('termCmdK6Btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureTerminalOpen();
    sendTerminalInput('./bin/k6 run benchmark/k6_stress_test.js\n');
  });

  document.getElementById('termCmdStatusBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureTerminalOpen();
    sendTerminalInput('git status\n');
  });

  document.getElementById('termCmdClearBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    term.clear();
    sendTerminalInput('clear\n');
  });
}

function connectTerminalWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws/terminal`;

  try {
    termWs = new WebSocket(wsUrl);
  } catch (err) {
    term.write(`\r\n\x1b[31m[WebSocket 連線建立失敗: ${err.message}]\x1b[0m\r\n`);
    return;
  }

  termWs.onopen = () => {
    if (fitAddon) {
      setTimeout(() => {
        fitAddon.fit();
        sendResize();
      }, 200);
    }
  };

  termWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        term.write(msg.data);
      }
    } catch {
      term.write(event.data);
    }
  };

  termWs.onclose = () => {
    if (state.engineInfo && state.engineInfo.mode === 'prod') {
      return;
    }
    term.write('\r\n\x1b[33m[Web Terminal 已中斷連線，5 秒後自動嘗試重新連接...]\x1b[0m\r\n');
    setTimeout(connectTerminalWebSocket, 5000);
  };

  term.onData((data) => {
    if (termWs && termWs.readyState === WebSocket.OPEN) {
      termWs.send(JSON.stringify({ type: 'input', data }));
    }
  });
}

function sendTerminalInput(cmd) {
  if (termWs && termWs.readyState === WebSocket.OPEN) {
    termWs.send(JSON.stringify({ type: 'input', data: cmd }));
    term.focus();
  }
}

function sendResize() {
  if (term && termWs && termWs.readyState === WebSocket.OPEN) {
    termWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }
}

function toggleTerminal() {
  const drawer = document.getElementById('terminalDrawer');
  const icon = document.getElementById('termToggleIcon');
  isTerminalCollapsed = !isTerminalCollapsed;

  if (isTerminalCollapsed) {
    drawer.classList.add('collapsed');
    icon.textContent = '▲';
  } else {
    drawer.classList.remove('collapsed');
    icon.textContent = '▼';
    if (fitAddon) {
      setTimeout(() => {
        fitAddon.fit();
        sendResize();
        term.focus();
      }, 250);
    }
  }
}

function ensureTerminalOpen() {
  if (isTerminalCollapsed) {
    toggleTerminal();
  }
}

// ==========================================================================
// Role Switcher & Traffic Light Coordination Protocol
// ==========================================================================

function setupRoleSwitcher() {
  elements.roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.getAttribute('data-role');
      state.currentRole = role;

      elements.roleButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (elements.viewOverview) elements.viewOverview.style.display = role === 'overview' ? 'block' : 'none';
      if (elements.viewClient) elements.viewClient.style.display = role === 'client' ? 'block' : 'none';
      if (elements.viewServer) elements.viewServer.style.display = role === 'server' ? 'block' : 'none';
      if (elements.viewLine) elements.viewLine.style.display = role === 'line' ? 'block' : 'none';
      if (elements.viewUpstream) elements.viewUpstream.style.display = role === 'upstream' ? 'block' : 'none';

      if (role === 'client') {
        updateClientWorkspace();
      } else if (role === 'server') {
        updateServerWorkspace();
      } else if (role === 'line') {
        updateLineWorkspace();
      } else if (role === 'upstream') {
        updateUpstreamWorkspace();
      }
    });
  });
}

async function fetchCoordinationStatus() {
  try {
    const resp = await fetch('/api/coordination/status');
    if (!resp.ok) return;
    const data = await resp.json();
    state.coordination = data;

    // Check global status
    const locks = data.locks || [];
    const routes = data.routes || [];

    if (locks.length > 0) {
      const l = locks[0];
      if (elements.globalTrafficDot) elements.globalTrafficDot.className = 'traffic-dot dot-red';
      if (elements.globalCoordinationText) {
        elements.globalCoordinationText.textContent = `🔴 鎖定中: ${l.route} (${l.lockedBy.toUpperCase()}: ${l.reason})`;
      }
    } else {
      const hasYellow = routes.some((r) => r.trafficLight?.color === 'YELLOW');
      if (hasYellow) {
        if (elements.globalTrafficDot) elements.globalTrafficDot.className = 'traffic-dot dot-yellow';
        if (elements.globalCoordinationText) {
          elements.globalCoordinationText.textContent = '🟡 協商演進中：偵測到動態漂移或樣本對齊中';
        }
      } else {
        if (elements.globalTrafficDot) elements.globalTrafficDot.className = 'traffic-dot dot-green';
        if (elements.globalCoordinationText) {
          elements.globalCoordinationText.textContent = '🟢 雙端對齊中：可自由發送與編輯';
        }
      }
    }

    // Update currently selected route light in Client & Server
    if (state.selectedRoute) {
      const rInfo = routes.find((r) => r.route === state.selectedRoute);
      if (rInfo && rInfo.trafficLight) {
        updateRouteTrafficLightUI(rInfo.trafficLight);
      }
    }
  } catch (err) {
    console.warn('Coordination polling failed:', err);
  }
}

function updateRouteTrafficLightUI(tl) {
  const isRed = tl.color === 'RED';
  const isYellow = tl.color === 'YELLOW';
  const dotClass = isRed ? 'traffic-dot dot-red' : isYellow ? 'traffic-dot dot-yellow' : 'traffic-dot dot-green';

  if (elements.clientTrafficDot) elements.clientTrafficDot.className = dotClass;
  if (elements.clientTrafficText) {
    elements.clientTrafficText.textContent = `${tl.label} - ${tl.description}`;
    elements.clientTrafficText.style.color = isRed ? '#f87171' : isYellow ? '#fbbf24' : '#34d399';
  }

  if (elements.serverTrafficDot) elements.serverTrafficDot.className = dotClass;
  if (elements.serverTrafficText) {
    elements.serverTrafficText.textContent = `${tl.label} - ${tl.description}`;
    elements.serverTrafficText.style.color = isRed ? '#f87171' : isYellow ? '#fbbf24' : '#34d399';
  }
}

// ==========================================================================
// Client Role Workspace
// ==========================================================================

function setupClientWorkspace() {
  if (elements.clientRouteSelect) {
    elements.clientRouteSelect.addEventListener('change', (e) => {
      selectRoute(e.target.value);
      updateClientWorkspace();
    });
  }

  // Lock Actions
  if (elements.clientAcquireLockBtn) {
    elements.clientAcquireLockBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) {
        alert('請先在上方選擇一個 API 路由以獲取鎖定。');
        return;
      }
      try {
        const { ok, data } = await safeApiRequest('/api/coordination/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: state.selectedRoute,
            role: 'client',
            reason: '前端流量驗收/混沌測試中 (Client Lock)',
            ttlMs: 45000,
          }),
        });
        if (ok) {
          alert(`已成功獲取客戶端鎖定！該端點已亮起 🔴 紅燈，保護測試不受後端突發重構干擾。`);
          fetchCoordinationStatus();
        } else {
          alert(`鎖定失敗: ${data.error || '未知錯誤'}`);
        }
      } catch (err) {
        alert(`請求失敗: ${err.message}`);
      }
    });
  }

  if (elements.clientReleaseLockBtn) {
    elements.clientReleaseLockBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) return;
      try {
        await safeApiRequest('/api/coordination/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: state.selectedRoute, role: 'client' }),
        });
        alert(`已釋放客戶端鎖定！`);
        fetchCoordinationStatus();
      } catch (err) {
        alert(`釋放失敗: ${err.message}`);
      }
    });
  }

  // Mock Mode Toggles
  if (elements.optMockFast) {
    elements.optMockFast.addEventListener('click', () => {
      elements.optMockFast.classList.add('selected');
      if (elements.optMockLive) elements.optMockLive.classList.remove('selected');
      if (elements.clientMockBadge) elements.clientMockBadge.textContent = 'Fast-Path 0ms';
      if (elements.clientEndpointInput) elements.clientEndpointInput.value = '/api/jit (Mock Fast-Path)';
    });
  }

  if (elements.optMockLive) {
    elements.optMockLive.addEventListener('click', () => {
      elements.optMockLive.classList.add('selected');
      if (elements.optMockFast) elements.optMockFast.classList.remove('selected');
      if (elements.clientMockBadge) elements.clientMockBadge.textContent = 'Live Gateway';
      if (elements.clientEndpointInput) elements.clientEndpointInput.value = '/api/jit';
    });
  }

  // Fuzz Mode Buttons
  const fuzzBtns = [elements.btnTrafficValid, elements.btnTrafficFuzz, elements.btnTrafficChaos];
  fuzzBtns.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      fuzzBtns.forEach((b) => b?.classList.remove('active'));
      btn.classList.add('active');
      state.trafficMode = btn.getAttribute('data-mode') || 'valid';
    });
  });

  // Count Slider
  if (elements.trafficCountSlider) {
    elements.trafficCountSlider.addEventListener('input', (e) => {
      state.trafficCount = parseInt(e.target.value, 10);
      if (elements.trafficCountVal) elements.trafficCountVal.textContent = `${state.trafficCount} 次`;
    });
  }

  // Run Traffic
  if (elements.runTrafficBtn) {
    elements.runTrafficBtn.addEventListener('click', runSyntheticTrafficSuite);
  }

  // Client Playground
  if (elements.clientSendBtn) {
    elements.clientSendBtn.addEventListener('click', sendClientPlaygroundRequest);
  }

  if (elements.clientFormatJsonBtn) {
    elements.clientFormatJsonBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(elements.clientPayloadInput.value);
        elements.clientPayloadInput.value = JSON.stringify(parsed, null, 2);
      } catch {
        alert('無效的 JSON！');
      }
    });
  }

  if (elements.clientPresetSemantic) {
    elements.clientPresetSemantic.addEventListener('click', () => {
      const r = state.routes.find((x) => x.route === state.selectedRoute);
      elements.clientPayloadInput.value = JSON.stringify(
        { semantic: r?.sampleSemantic || `請幫我執行 ${state.selectedRoute} 服務請求` },
        null,
        2
      );
    });
  }

  if (elements.clientPresetStable) {
    elements.clientPresetStable.addEventListener('click', () => {
      const r = state.routes.find((x) => x.route === state.selectedRoute);
      elements.clientPayloadInput.value = JSON.stringify(
        { route: state.selectedRoute, ...(r?.samplePayload || {}) },
        null,
        2
      );
    });
  }

  if (elements.clientPresetDrift) {
    elements.clientPresetDrift.addEventListener('click', () => {
      const r = state.routes.find((x) => x.route === state.selectedRoute);
      const sample = r?.samplePayload ? { ...r.samplePayload } : {};
      const fuzzed = {};
      for (const [k, v] of Object.entries(sample)) {
        const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        fuzzed[camelKey] = typeof v === 'number' ? String(v) : v;
      }
      elements.clientPayloadInput.value = JSON.stringify(
        { route: state.selectedRoute, ...fuzzed },
        null,
        2
      );
    });
  }

  // Client SDK tabs
  const sdkTabs = [elements.btnSdkTs, elements.btnSdkPy, elements.btnSdkConnect];
  sdkTabs.forEach((tab) => {
    if (!tab) return;
    tab.addEventListener('click', () => {
      sdkTabs.forEach((t) => t?.classList.remove('active'));
      tab.classList.add('active');
      state.clientSdkLang = tab.getAttribute('data-client-lang') || 'typescript';
      updateClientSdkView();
    });
  });

  if (elements.copyClientSdkBtn) {
    elements.copyClientSdkBtn.addEventListener('click', () => {
      const text = elements.clientSdkCodeView.textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('已成功複製 Client SDK 代碼！');
      });
    });
  }
}

async function runSyntheticTrafficSuite() {
  if (!state.selectedRoute) {
    alert('請先選擇測試目標路由！');
    return;
  }

  const r = state.routes.find((x) => x.route === state.selectedRoute);
  const baseSample = r?.samplePayload || {};
  const count = state.trafficCount || 5;
  const mode = state.trafficMode || 'valid';

  elements.runTrafficBtn.disabled = true;
  elements.runTrafficBtn.innerHTML = '<span>⏳ 合成流量發送中...</span>';
  elements.trafficResultBox.style.display = 'block';
  elements.trafficLogView.textContent = `[Traffic] 開始發送 ${count} 次 ${mode.toUpperCase()} 合成流量至 ${state.selectedRoute}...\n`;

  let successCount = 0;
  let repairedCount = 0;
  let totalLatency = 0;

  for (let i = 1; i <= count; i++) {
    let payload = { route: state.selectedRoute, ...baseSample };

    if (mode === 'fuzz') {
      const fuzzed = {};
      for (const [k, v] of Object.entries(baseSample)) {
        const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        fuzzed[camelKey] = typeof v === 'number' ? String(v) : v;
      }
      payload = { route: state.selectedRoute, ...fuzzed };
    } else if (mode === 'chaos') {
      payload = {
        route: state.selectedRoute,
        ...baseSample,
        _chaos_noise: Math.random().toString(36).substring(7),
        _jitter_ms: Math.floor(Math.random() * 50),
      };
    }

    const t0 = performance.now();
    try {
      const resp = await fetch('/api/jit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const t1 = performance.now();
      const latency = Math.round(t1 - t0);
      totalLatency += latency;

      if (resp.ok) {
        successCount++;
        const resData = await resp.json();
        const wasRepaired = resData.context?.autoRepaired;
        if (wasRepaired) repairedCount++;
        elements.trafficLogView.textContent += `[#${i}] 200 OK (${latency}ms) ${wasRepaired ? '🛠️ [Auto-Repaired]' : '⚡ [Direct]'}\n`;
      } else {
        elements.trafficLogView.textContent += `[#${i}] ${resp.status} Error (${latency}ms)\n`;
      }
    } catch (err) {
      elements.trafficLogView.textContent += `[#${i}] Failed: ${err.message}\n`;
    }

    elements.trafficLogView.scrollTop = elements.trafficLogView.scrollHeight;
    await new Promise((res) => setTimeout(res, 80));
  }

  elements.trafTotal.textContent = count;
  elements.trafSuccess.textContent = successCount;
  elements.trafRepaired.textContent = repairedCount;
  elements.trafLatency.textContent = `${Math.round(totalLatency / count)}ms`;

  elements.runTrafficBtn.disabled = false;
  elements.runTrafficBtn.innerHTML = '<span>🚀 發送合成流量驗收</span>';
  loadRoutes();
}

async function sendClientPlaygroundRequest() {
  const rawInput = elements.clientPayloadInput.value.trim();
  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    alert('Payload 必須為有效的 JSON！');
    return;
  }

  elements.clientSendBtn.disabled = true;
  elements.clientSendBtn.innerHTML = '<span>⏳ 處理中...</span>';
  elements.clientResponseOutput.textContent = '發送請求中...';

  const startTime = performance.now();
  try {
    const resp = await fetch('/api/jit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(1);
    const data = await resp.json();

    elements.clientResponseOutput.textContent = JSON.stringify(data, null, 2);
    elements.clientRespPhase.textContent = `Phase: ${data.context?.phase || 'phase1'}`;
    elements.clientRespLatency.textContent = `Time: ${duration} ms`;
    elements.clientRespAiLatency.textContent = `AI: ${data.context?.aiLatencyMs || 0} ms`;

    if (data.context?.autoRepaired) {
      elements.clientRespPhase.textContent += ' 🛠️ Repaired';
    }
    loadRoutes();
  } catch (err) {
    elements.clientResponseOutput.textContent = `發送失敗: ${err.message}`;
  } finally {
    elements.clientSendBtn.disabled = false;
    elements.clientSendBtn.innerHTML = '<span>發送請求</span>';
  }
}

function updateClientWorkspace() {
  if (!state.selectedRoute && state.routes.length > 0) {
    state.selectedRoute = state.routes[0].route;
  }
  if (elements.clientRouteSelect && state.selectedRoute) {
    elements.clientRouteSelect.value = state.selectedRoute;
  }

  const r = state.routes.find((x) => x.route === state.selectedRoute);
  if (r && elements.clientPayloadInput) {
    elements.clientPayloadInput.value = JSON.stringify(
      { route: r.route, ...(r.samplePayload || {}) },
      null,
      2
    );
  }
  updateClientSdkView();
}

function updateClientSdkView() {
  const route = state.selectedRoute || 'create_order';
  const lang = state.clientSdkLang || 'typescript';

  if (!elements.clientSdkFilename || !elements.clientSdkCodeView) return;

  if (lang === 'typescript') {
    elements.clientSdkFilename.textContent = `${route}_client.ts`;
    elements.clientSdkCodeView.textContent = `// JIT API Client (TypeScript / Fetch)
export async function ${route.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}(payload: Record<string, unknown>) {
  const response = await fetch("http://localhost:3005/api/jit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route: "${route}", ...payload }),
  });
  if (!response.ok) throw new Error(\`JIT API Error: \${response.status}\`);
  return await response.json();
}

// 範例調用：
// const res = await ${route.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}({ ... });`;
  } else if (lang === 'python') {
    elements.clientSdkFilename.textContent = `${route}_client.py`;
    elements.clientSdkCodeView.textContent = `# JIT API Client (Python / Requests)
import requests

def ${route}(payload: dict) -> dict:
    url = "http://localhost:3005/api/jit"
    data = {"route": "${route}", **payload}
    res = requests.post(url, json=data)
    res.raise_for_status()
    return res.json()

# 範例調用:
# result = ${route}({ ... })`;
  } else if (lang === 'connect') {
    elements.clientSdkFilename.textContent = `${route}_connect.ts`;
    elements.clientSdkCodeView.textContent = `// ConnectRPC (Triple-Protocol: Connect / gRPC-Web / gRPC)
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

const transport = createConnectTransport({
  baseUrl: "http://localhost:3005",
});

// 通用 RPC 入口
const res = await fetch("http://localhost:3005/jit.v1.JITService/Execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ route: "${route}", payload: JSON.stringify({ ... }) }),
});`;
  }
}

// ==========================================================================
// Server Role Workspace
// ==========================================================================

function setupServerWorkspace() {
  if (elements.serverRouteSelect) {
    elements.serverRouteSelect.addEventListener('change', (e) => {
      selectRoute(e.target.value);
      updateServerWorkspace();
    });
  }

  // Lock Actions
  if (elements.serverAcquireLockBtn) {
    elements.serverAcquireLockBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) {
        alert('請先在上方選擇一個 API 路由以獲取鎖定。');
        return;
      }
      try {
        const { ok, data } = await safeApiRequest('/api/coordination/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: state.selectedRoute,
            role: 'server',
            reason: '伺服端架構重構/版本發布中 (Server Lock)',
            ttlMs: 45000,
          }),
        });
        if (ok) {
          alert(`已成功獲取伺服端發布鎖！該端點已亮起 🔴 紅燈，通知 Client 端暫停變更。`);
          fetchCoordinationStatus();
        } else {
          alert(`鎖定失敗: ${data.error || '未知錯誤'}`);
        }
      } catch (err) {
        alert(`請求失敗: ${err.message}`);
      }
    });
  }

  if (elements.serverReleaseLockBtn) {
    elements.serverReleaseLockBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) return;
      try {
        await safeApiRequest('/api/coordination/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: state.selectedRoute, role: 'server' }),
        });
        alert(`已釋放伺服端鎖定！`);
        fetchCoordinationStatus();
      } catch (err) {
        alert(`釋放失敗: ${err.message}`);
      }
    });
  }

  // Manual Freeze Button
  if (elements.serverFreezeBtn) {
    elements.serverFreezeBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) return;
      const r = state.routes.find((x) => x.route === state.selectedRoute);
      const payload = { route: state.selectedRoute, ...(r?.samplePayload || {}) };
      for (let i = 0; i < 3; i++) {
        await fetch('/api/jit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      alert(`已對路由 '${state.selectedRoute}' 觸發連續樣本收斂，現已固化為 Phase 3 Fast-Path！`);
      refreshAll();
    });
  }

  // Unfreeze
  if (elements.serverUnfreezeBtn) {
    elements.serverUnfreezeBtn.addEventListener('click', async () => {
      if (!state.selectedRoute) return;
      await fetch('/api/jit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: state.selectedRoute, _unfreeze_drift_key: 'trigger' }),
      });
      alert(`已重置路由 '${state.selectedRoute}' 並重啟動態演進！`);
      refreshAll();
    });
  }

  // Reload specs
  if (elements.serverReloadSpecsBtn) {
    elements.serverReloadSpecsBtn.addEventListener('click', reloadAllSpecs);
  }

  // Save active spec in server editor
  if (elements.serverSaveSpecBtn) {
    elements.serverSaveSpecBtn.addEventListener('click', async () => {
      if (!state.activeSpecFile) return;
      const content = elements.serverSpecEditor.value;
      try {
        const resp = await fetch(`/api/specs/${encodeURIComponent(state.activeSpecFile)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/markdown' },
          body: content,
        });
        if (resp.ok) {
          alert(`規格 '${state.activeSpecFile}' 已成功儲存並完成熱重載！`);
          refreshAll();
        } else {
          alert('儲存失敗！');
        }
      } catch (err) {
        alert(`儲存出錯: ${err.message}`);
      }
    });
  }

  // Server k6 benchmark
  if (elements.serverVusSlider) {
    elements.serverVusSlider.addEventListener('input', (e) => {
      if (elements.serverVusVal) elements.serverVusVal.textContent = `${e.target.value} VUs`;
    });
  }
  if (elements.serverDurationSlider) {
    elements.serverDurationSlider.addEventListener('input', (e) => {
      if (elements.serverDurationVal) elements.serverDurationVal.textContent = `${e.target.value}s`;
    });
  }

  if (elements.serverRunK6Btn) {
    elements.serverRunK6Btn.addEventListener('click', async () => {
      if (!state.selectedRoute) return;
      const vus = parseInt(elements.serverVusSlider.value, 10);
      const duration = `${elements.serverDurationSlider.value}s`;

      elements.serverRunK6Btn.disabled = true;
      elements.serverRunK6Btn.innerHTML = '<span>⏳ 壓測執行中 (Server 鎖定中)...</span>';
      fetchCoordinationStatus();

      try {
        const resp = await fetch('/api/bench/k6', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'phase3',
            vus,
            duration,
            targetRoute: state.selectedRoute,
          }),
        });
        const result = await resp.json();
        elements.serverBenchResultBox.style.display = 'block';
        elements.srvRps.textContent = `${Math.round(result.metrics?.rps || 0)} req/s`;
        elements.srvAvg.textContent = `${(result.metrics?.avgLatency || 0).toFixed(2)}ms`;
        elements.srvP95.textContent = `${(result.metrics?.p95Latency || 0).toFixed(2)}ms`;
        elements.srvSuccess.textContent = `${Math.round((result.metrics?.successRate || 1) * 100)}%`;
      } catch (err) {
        alert(`壓測執行失敗: ${err.message}`);
      } finally {
        elements.serverRunK6Btn.disabled = false;
        elements.serverRunK6Btn.innerHTML = '<span>⚡ 啟動 k6 壓測 (獨佔鎖定)</span>';
        fetchCoordinationStatus();
      }
    });
  }

  // Release Snapshot & Rollback
  if (elements.serverSnapshotBtn) {
    elements.serverSnapshotBtn.addEventListener('click', async () => {
      const ver = elements.serverReleaseVersionInput.value.trim();
      if (!ver) {
        alert('請輸入版本號 (如 1.1.0)！');
        return;
      }
      try {
        const resp = await fetch('/api/releases/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: ver }),
        });
        if (resp.ok) {
          alert(`版本 v${ver} 快照建立完成，SHA-256 簽名已固化！`);
          loadReleasesList();
        } else {
          alert('建立快照失敗！');
        }
      } catch (err) {
        alert(`建立快照出錯: ${err.message}`);
      }
    });
  }

  if (elements.serverRollbackBtn) {
    elements.serverRollbackBtn.addEventListener('click', async () => {
      const ver = elements.serverRollbackSelect.value;
      if (!ver) return;
      if (!confirm(`確定要秒級回滾至歷史版本 v${ver} 嗎？`)) return;
      try {
        const resp = await fetch('/api/releases/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: ver }),
        });
        if (resp.ok) {
          alert(`已成功回滾至版本 v${ver}！`);
          refreshAll();
        } else {
          alert('回滾失敗！');
        }
      } catch (err) {
        alert(`回滾出錯: ${err.message}`);
      }
    });
  }
}

function updateServerWorkspace() {
  if (!state.selectedRoute && state.routes.length > 0) {
    state.selectedRoute = state.routes[0].route;
  }
  if (elements.serverRouteSelect && state.selectedRoute) {
    elements.serverRouteSelect.value = state.selectedRoute;
  }

  const r = state.routes.find((x) => x.route === state.selectedRoute);
  if (r) {
    const isFrozen = r.status?.isFrozen;
    const count = r.status?.metrics?.count || 0;
    const threshold = r.status?.metrics?.threshold || 3;
    if (elements.serverPhaseBadge) {
      elements.serverPhaseBadge.textContent = isFrozen ? 'Phase 3: Frozen (0ms)' : `Phase 2: Observing (${count}/${threshold})`;
    }
    if (elements.serverSampleProgress) {
      elements.serverSampleProgress.textContent = isFrozen ? `${threshold}/${threshold} (已完全固化)` : `${count}/${threshold} (協商收斂中)`;
    }
  }

  if (state.specs.length > 0) {
    renderServerSpecsList();
  }
  loadReleasesList();
}

function renderServerSpecsList() {
  if (!elements.serverSpecFileList) return;
  elements.serverSpecFileList.innerHTML = state.specs
    .map((s) => `
      <div class="spec-file-item ${state.activeSpecFile === s.filename ? 'active' : ''}" data-spec="${s.filename}" style="padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; margin-bottom: 4px; background: rgba(255,255,255,0.03);">
        <span style="font-family: var(--font-mono); font-size: 13px;">${s.filename}</span>
        <span class="badge-version">${s.version || '1.0.0'}</span>
      </div>
    `)
    .join('');

  elements.serverSpecFileList.querySelectorAll('.spec-file-item').forEach((item) => {
    item.addEventListener('click', () => {
      const filename = item.getAttribute('data-spec');
      loadServerSpecContent(filename);
    });
  });

  if (state.activeSpecFile) {
    loadServerSpecContent(state.activeSpecFile);
  } else if (state.specs.length > 0) {
    loadServerSpecContent(state.specs[0].filename);
  }
}

async function loadServerSpecContent(filename) {
  state.activeSpecFile = filename;
  if (elements.serverActiveSpecName) elements.serverActiveSpecName.textContent = filename;
  try {
    const resp = await fetch(`/api/specs/${encodeURIComponent(filename)}`);
    if (resp.ok) {
      const content = await resp.text();
      if (elements.serverSpecEditor) elements.serverSpecEditor.value = content;
    }
  } catch (err) {
    console.error('Failed to load spec:', err);
  }
}

async function loadReleasesList() {
  if (!elements.serverRollbackSelect) return;
  try {
    const resp = await fetch('/api/releases');
    if (resp.ok) {
      const releases = await resp.json();
      if (releases.length > 0) {
        elements.serverRollbackSelect.innerHTML = releases
          .map((r) => `<option value="${r.version}">v${r.version} (${r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '歷史快照'})</option>`)
          .join('');
      } else {
        elements.serverRollbackSelect.innerHTML = '<option value="">尚無已發布歷史快照</option>';
      }
    }
  } catch {}
}

// ==========================================================================
// ROLE VIEW 4: LINE Control Center & Master Hub
// ==========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupLineWorkspace() {
  // Copy Webhook URL
  if (elements.copyWebhookUrlBtn && elements.lineWebhookUrlInput) {
    elements.copyWebhookUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(elements.lineWebhookUrlInput.value);
      alert('已複製 Webhook URL 到剪貼簿！');
    });
  }

  // Save LINE Config
  if (elements.saveLineConfigBtn) {
    elements.saveLineConfigBtn.addEventListener('click', async () => {
      await saveLineConfig();
    });
  }

  // Add Whitelist User
  if (elements.addWhitelistBtn) {
    elements.addWhitelistBtn.addEventListener('click', async () => {
      await addWhitelistUser();
    });
  }

  // Filter Chips for Tickets
  if (elements.ticketFilterChips) {
    elements.ticketFilterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        elements.ticketFilterChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.ticketFilter = chip.getAttribute('data-filter') || 'ALL';
        renderTickets();
      });
    });
  }

  // Chat Simulator Send
  if (elements.chatSimulatorSendBtn) {
    elements.chatSimulatorSendBtn.addEventListener('click', () => {
      sendSimulatedChatMessage();
    });
  }

  if (elements.chatSimulatorInput) {
    elements.chatSimulatorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendSimulatedChatMessage();
      }
    });
  }

  // Chat Simulator Quick Shortcuts
  if (elements.chatShortcutChips) {
    elements.chatShortcutChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const msg = chip.getAttribute('data-msg');
        if (msg && elements.chatSimulatorInput) {
          elements.chatSimulatorInput.value = msg;
          sendSimulatedChatMessage();
        }
      });
    });
  }
}

async function updateLineWorkspace() {
  await Promise.all([
    fetchLineConfig(),
    fetchWhitelist(),
    fetchTickets(),
  ]);
}

async function fetchLineConfig() {
  try {
    const { ok, data } = await safeApiRequest('/api/line/config');
    if (ok && data) {
      state.lineConfig = data;
      if (elements.lineChannelSecretInput && data.channelSecret) {
        elements.lineChannelSecretInput.value = data.channelSecret;
      }
      if (elements.lineAccessTokenInput && data.channelAccessToken) {
        elements.lineAccessTokenInput.value = data.channelAccessToken;
      }
      if (elements.lineWebhookUrlInput && data.webhookUrl) {
        elements.lineWebhookUrlInput.value = data.webhookUrl;
      }
      if (elements.lineBotStatusText) {
        elements.lineBotStatusText.textContent = data.status === 'CONNECTED' ? '🟢 實體 LINE 連線中' : '🟢 本地模擬中 (無需外網)';
        elements.lineBotStatusText.style.color = '#06C755';
      }
      if (elements.lineCredBadge) {
        elements.lineCredBadge.textContent = data.status === 'CONNECTED' ? 'Live Connected' : 'Simulated/Local';
      }
    }
  } catch (err) {
    console.warn('Failed to fetch LINE config:', err);
  }
}

async function saveLineConfig() {
  const secret = elements.lineChannelSecretInput ? elements.lineChannelSecretInput.value.trim() : '';
  const token = elements.lineAccessTokenInput ? elements.lineAccessTokenInput.value.trim() : '';
  const webhook = elements.lineWebhookUrlInput ? elements.lineWebhookUrlInput.value.trim() : '';

  try {
    const { ok } = await safeApiRequest('/api/line/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelSecret: secret,
        channelAccessToken: token,
        webhookUrl: webhook,
        status: secret ? 'CONNECTED' : 'SIMULATION_ONLY',
      }),
    });
    if (ok) {
      alert('✅ LINE Bot 組態已成功儲存！');
      fetchLineConfig();
    }
  } catch (err) {
    alert(`儲存失敗: ${err.message}`);
  }
}

async function fetchWhitelist() {
  try {
    const { ok, data } = await safeApiRequest('/api/line/whitelist');
    if (ok && Array.isArray(data)) {
      state.whitelist = data;
      if (elements.lineWhitelistCount) {
        elements.lineWhitelistCount.textContent = data.length;
      }
      renderWhitelist();
    }
  } catch (err) {
    console.warn('Failed to fetch whitelist:', err);
  }
}

function renderWhitelist() {
  if (!elements.whitelistContainer) return;
  if (state.whitelist.length === 0) {
    elements.whitelistContainer.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:10px;">名冊尚無成員</div>';
    return;
  }

  elements.whitelistContainer.innerHTML = state.whitelist
    .map((u) => {
      const roleBadge = u.role === 'pm' ? 'badge-pm' : u.role === 'dev' ? 'badge-dev' : 'badge-client';
      const apisInfo = u.allowedApis && u.allowedApis.length > 0 ? `授權端點: ${u.allowedApis.join(', ')}` : (u.role === 'pm' || u.role === 'dev' ? '全域授權 (*)' : '未限制');
      const companyInfo = u.company ? ` | 🏢 ${escapeHtml(u.company)}` : '';
      return `
        <div class="whitelist-item">
          <div class="whitelist-user-meta">
            <span class="whitelist-user-name">
              ${escapeHtml(u.name)}
              <span class="user-role-tag ${roleBadge}">[${escapeHtml((u.role || 'client').toUpperCase())}]</span>
              <span style="font-size:10px;color:var(--text-tertiary);">${companyInfo}</span>
            </span>
            <span class="whitelist-user-id">${escapeHtml(u.id)} · <span style="font-size:10px;color:var(--color-primary);">${escapeHtml(apisInfo)}</span></span>
          </div>
          <button class="whitelist-delete-btn" onclick="deleteWhitelistUser('${escapeHtml(u.id)}')" title="移出名單">✕</button>
        </div>
      `;
    })
    .join('');
}

async function addWhitelistUser() {
  const id = elements.newWhitelistId ? elements.newWhitelistId.value.trim() : '';
  const name = elements.newWhitelistName ? elements.newWhitelistName.value.trim() : '';
  const role = elements.newWhitelistRole ? elements.newWhitelistRole.value : 'client';
  const company = elements.newWhitelistCompany ? elements.newWhitelistCompany.value.trim() : '';
  const apisRaw = elements.newWhitelistApis ? elements.newWhitelistApis.value.trim() : '';
  const allowedApis = apisRaw ? apisRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  if (!id || !name) {
    alert('請輸入成員 ID 與姓名！');
    return;
  }

  try {
    const { ok } = await safeApiRequest('/api/line/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, role, company, allowedApis }),
    });
    if (ok) {
      if (elements.newWhitelistId) elements.newWhitelistId.value = '';
      if (elements.newWhitelistName) elements.newWhitelistName.value = '';
      if (elements.newWhitelistCompany) elements.newWhitelistCompany.value = '';
      if (elements.newWhitelistApis) elements.newWhitelistApis.value = '';
      fetchWhitelist();
    }
  } catch (err) {
    alert(`新增失敗: ${err.message}`);
  }
}

window.deleteWhitelistUser = async function (userId) {
  if (!confirm(`確定要將 ${userId} 移出白名單嗎？`)) return;
  try {
    const { ok } = await safeApiRequest(`/api/line/whitelist/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    if (ok) {
      fetchWhitelist();
    }
  } catch (err) {
    alert(`刪除失敗: ${err.message}`);
  }
};

async function fetchTickets() {
  try {
    const { ok, data } = await safeApiRequest('/api/line/tickets');
    if (ok && Array.isArray(data)) {
      state.tickets = data;
      const pendingCount = data.filter((t) => t.status === 'PENDING' || t.status === 'EVALUATING').length;
      if (elements.linePendingTicketsCount) {
        elements.linePendingTicketsCount.textContent = pendingCount;
      }
      if (elements.ticketCountBadge) {
        elements.ticketCountBadge.textContent = data.length;
      }
      renderTickets();
    }
  } catch (err) {
    console.warn('Failed to fetch tickets:', err);
  }
}

function renderTickets() {
  if (!elements.ticketCardsContainer) return;
  const filtered = state.tickets.filter((t) => {
    if (state.ticketFilter === 'ALL') return true;
    return t.status === state.ticketFilter;
  });

  if (filtered.length === 0) {
    elements.ticketCardsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
        <span style="font-size: 2rem; display: block; margin-bottom: 8px;">📭</span>
        <span>目前沒有【${state.ticketFilter}】狀態的工單。</span>
        <p style="font-size: 11px; margin-top: 6px;">可使用右側「LINE 模擬器」發送需求，系統將自動受理並立單！</p>
      </div>
    `;
    return;
  }

  const triageMap = {
    DISCUSS_WEEKLY_MEETING: '📅 週會討論 (破壞性/架構)',
    MASTER_DIRECT_HANDLE: '⚡ Master 立即處理 (緊急/權限)',
    AI_AGENT_AUTONOMOUS: '🤖 可交 AI Agent 處理',
    REJECT: '❌ 建議駁回 (模糊/不符)',
  };

  elements.ticketCardsContainer.innerHTML = filtered
    .map((t) => {
      const dateStr = new Date(t.timestamp).toLocaleTimeString();
      const badgeClass = `ticket-badge-${t.status}`;
      const statusLabel =
        t.status === 'PENDING'
          ? '待審核 (PENDING)'
          : t.status === 'EVALUATING'
          ? 'Jev 評審中...'
          : t.status === 'APPROVED'
          ? '已批准 (APPROVED)'
          : t.status === 'SYNTHESIZED'
          ? '已生成代碼 (SYNTHESIZED)'
          : '已駁回 (REJECTED)';

      const priority = t.priorityLevel || 'P2';
      const importanceScore = t.importanceScore !== undefined ? t.importanceScore : 50;
      const importanceLevel = t.importanceLevel || (importanceScore >= 75 ? 'HIGH' : importanceScore >= 50 ? 'MEDIUM' : 'LOW');
      const urgencyScore = t.urgencyScore !== undefined ? t.urgencyScore : 50;
      const urgencyLevel = t.urgencyLevel || (urgencyScore >= 85 ? 'CRITICAL' : urgencyScore >= 65 ? 'HIGH' : urgencyScore >= 40 ? 'MEDIUM' : 'LOW');
      const riskScore = t.riskScore !== undefined ? t.riskScore : 20;
      const riskLevel = t.riskLevel || (riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW');

      const triageKey = t.triageAction || 'AI_AGENT_AUTONOMOUS';
      const triageText = triageMap[triageKey] || '⏳ 評估中';

      // 3-Metric Indicators Bar
      const impClass = `metric-importance-${importanceLevel.toLowerCase()}`;
      const urgClass = `metric-urgency-${urgencyLevel.toLowerCase()}`;
      const rskClass = `metric-risk-${riskLevel.toLowerCase()}`;

      const metricsBarHtml = `
        <div class="jev-metrics-bar">
          <span class="metric-pill ${impClass}" title="Jev 重要性評估 (業務價值/客戶影響)">🌟 重要性: ${importanceScore} (${importanceLevel})</span>
          <span class="metric-pill ${urgClass}" title="Jev 急迫性評估 (時效/緊急/阻塞)">⏰ 急迫性: ${urgencyScore} (${urgencyLevel})</span>
          <span class="metric-pill ${rskClass}" title="Jev 危險性評估 (Breaking Change / 架構衝突)">⚠️ 危險性: ${riskScore} (${riskLevel})</span>
          <span class="triage-badge triage-${triageKey.toLowerCase()}">${triageText}</span>
        </div>
      `;

      // Jev Advice Box HTML
      let adviceBoxHtml = '';
      if (t.triageAdvice) {
        const adviceType = triageKey === 'DISCUSS_WEEKLY_MEETING' ? 'meeting'
          : triageKey === 'MASTER_DIRECT_HANDLE' ? 'master'
          : triageKey === 'AI_AGENT_AUTONOMOUS' ? 'agent'
          : 'reject';
        adviceBoxHtml = `
          <div class="ticket-advice-box ${adviceType}">
            <strong>💡 Jev 處置建議：</strong> ${escapeHtml(t.triageAdvice)}
          </div>
        `;
      }

      // Jev Review Box HTML
      let jevBoxHtml = '';
      if (t.jevReview) {
        const jr = t.jevReview;
        const confPercent = (jr.confidence * 100).toFixed(0);
        jevBoxHtml = `
          <div class="jev-review-box">
            <div class="jev-review-header">
              <span>🤖 TypeSafe Jev 評定結果: <strong>${escapeHtml(jr.decision)}</strong></span>
              <span>信心度: ${confPercent}%</span>
            </div>
            <div class="jev-metrics-row">
              <span class="jev-metric-item">相容性評分: <strong style="color: #34d399;">${jr.compatibilityScore.toFixed(2)}</strong></span>
              <span class="jev-metric-item">破壞性風險: <strong style="color: ${jr.breakingRisk > 0.5 ? '#f87171' : '#fbbf24'};">${jr.breakingRisk.toFixed(2)}</strong></span>
            </div>
            <div class="jev-rationale-text">${escapeHtml(jr.rationale)}</div>
            ${jr.suggestedPatch ? `<pre class="jev-patch-preview">${escapeHtml(jr.suggestedPatch)}</pre>` : ''}
          </div>
        `;
      }

      // Situation Summary HTML
      let situationHtml = '';
      if (t.situationSummary) {
        situationHtml = `
          <div class="ticket-situation-box" style="margin: 8px 0; padding: 6px 10px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; border-radius: 4px; font-size: 11px;">
            <strong>💡 情境分析：</strong> ${escapeHtml(t.situationSummary)}
          </div>
        `;
      }

      // Master Action Buttons
      let actionBtnsHtml = '';
      if (t.status === 'PENDING' || t.status === 'EVALUATING') {
        actionBtnsHtml = `
          <div class="ticket-actions-row">
            <button class="secondary-btn" onclick="triggerJevReview('${escapeHtml(t.id)}')">🤖 Jev 智慧審查</button>
            <button class="primary-btn" style="background:#06C755!important;color:#fff!important;" onclick="executeMasterAction('${escapeHtml(t.id)}', 'APPROVE', true)">✅ 批准並合成 Spec</button>
            <button class="secondary-btn" onclick="executeMasterAction('${escapeHtml(t.id)}', 'APPROVE', false)">✍️ 批准 (暫不產代碼)</button>
            <button class="secondary-btn" style="color: #c084fc; border-color: rgba(168, 85, 247, 0.4);" onclick="copyAgentPrompt('${escapeHtml(t.id)}')">🤖 複製 Agent 執行指令</button>
            <button class="secondary-btn" style="color:#f87171;" onclick="executeMasterAction('${escapeHtml(t.id)}', 'REJECT', false)">❌ 駁回</button>
          </div>
        `;
      } else if (t.status === 'SYNTHESIZED') {
        actionBtnsHtml = `
          <div class="ticket-actions-row">
            <span style="font-size:11px;color:#38bdf8;">🎉 已自動寫入 specs/${escapeHtml(t.synthesizedSpecFile || '')}</span>
            <button class="secondary-btn" style="font-size:11px;" onclick="viewSynthesizedSpec('${escapeHtml(t.synthesizedSpecFile || '')}')">📝 在 Server 視圖檢視</button>
            <button class="secondary-btn" style="font-size:11px;color: #c084fc;" onclick="copyAgentPrompt('${escapeHtml(t.id)}')">🤖 複製 Agent 指令</button>
          </div>
        `;
      } else if (t.status === 'APPROVED') {
        actionBtnsHtml = `
          <div class="ticket-actions-row">
            <span style="font-size:11px;color:#34d399;">✅ Master 已批准此工單需求</span>
            <button class="secondary-btn" style="font-size:11px;" onclick="executeMasterAction('${escapeHtml(t.id)}', 'APPROVE', true)">⚡ 一鍵編譯為靜態代碼</button>
            <button class="secondary-btn" style="font-size:11px;color: #c084fc;" onclick="copyAgentPrompt('${escapeHtml(t.id)}')">🤖 複製 Agent 指令</button>
          </div>
        `;
      } else if (t.status === 'REJECTED') {
        actionBtnsHtml = `
          <div class="ticket-actions-row">
            <span style="font-size:11px;color:#f87171;">🚫 Master 已駁回此需求 (${escapeHtml(t.masterNotes || '不符架構規範')})</span>
          </div>
        `;
      }

      const companyTag = t.company ? ` · 🏢 ${escapeHtml(t.company)}` : '';
      const roleTag = `<span class="user-role-tag badge-${escapeHtml(t.role || 'client')}">${escapeHtml((t.role || 'client').toUpperCase())}</span>`;

      return `
        <div class="ticket-card" id="card_${escapeHtml(t.id)}">
          <div class="ticket-header-row">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="ticket-id-tag">🎫 ${escapeHtml(t.id)}</span>
              <span class="priority-badge priority-${priority.toLowerCase()}">${priority}</span>
            </div>
            <span class="ticket-status-badge ${badgeClass}">${statusLabel}</span>
          </div>
          ${metricsBarHtml}
          <div class="ticket-meta-row">
            <span>👤 ${escapeHtml(t.userName)} ${roleTag}${companyTag} (${escapeHtml(t.userId)})</span>
            <span>📍 路由: <code>${escapeHtml(t.targetRoute || 'General')}</code></span>
            <span>🕒 ${dateStr}</span>
            <span>來源: ${t.source === 'line' ? '📱 LINE' : '💻 模擬器'}</span>
          </div>
          <div class="ticket-message-box">
            "${escapeHtml(t.message)}"
          </div>
          ${situationHtml}
          ${adviceBoxHtml}
          ${jevBoxHtml}
          ${actionBtnsHtml}
        </div>
      `;
    })
    .join('');
}

window.triggerJevReview = async function (ticketId) {
  try {
    const card = document.getElementById(`card_${ticketId}`);
    if (card) {
      const badge = card.querySelector('.ticket-status-badge');
      if (badge) badge.textContent = '🤖 Jev 深度分析中...';
    }
    const { ok } = await safeApiRequest(`/api/line/tickets/${encodeURIComponent(ticketId)}/review`, {
      method: 'POST',
    });
    if (ok) {
      fetchTickets();
    }
  } catch (err) {
    alert(`Jev 審查失敗: ${err.message}`);
  }
};

window.executeMasterAction = async function (ticketId, action, synthesizeSpec) {
  let notes = '';
  if (action === 'REJECT') {
    notes = prompt('請輸入駁回原因 (將回傳給提單者):', '與目前架構衝突或已有替代端點');
    if (notes === null) return;
  }

  try {
    const { ok } = await safeApiRequest(`/api/line/tickets/${encodeURIComponent(ticketId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, synthesizeSpec, notes }),
    });
    if (ok) {
      if (synthesizeSpec) {
        alert(`✅ 工單 ${ticketId} 已批准，且已自動生成 API Spec 並熱重載入引擎！`);
        refreshAll();
      } else if (action === 'APPROVE') {
        alert(`✅ 工單 ${ticketId} 已批准！`);
      } else {
        alert(`工單 ${ticketId} 已駁回。`);
      }
      fetchTickets();
    }
  } catch (err) {
    alert(`操作失敗: ${err.message}`);
  }
};

window.viewSynthesizedSpec = function (filename) {
  if (!filename) return;
  const srvBtn = document.getElementById('roleServerBtn');
  if (srvBtn) srvBtn.click();
  setTimeout(() => {
    loadServerSpecContent(filename);
  }, 200);
};

async function sendSimulatedChatMessage() {
  if (!elements.chatSimulatorInput) return;
  const message = elements.chatSimulatorInput.value.trim();
  if (!message) return;

  const selectUser = elements.simulatedUserSelect ? elements.simulatedUserSelect.value : 'U_FRONTEND_ALICE';
  const userNameMap = {
    U_FRONTEND_ALICE: 'Frontend Alice',
    U_MOBILE_BOB: 'App Bob',
    U_PM_CAROL: 'PM Carol',
    U_DEV_LEAD: 'Master Engineer',
  };
  const userName = userNameMap[selectUser] || '協同開發者';

  // 1. Append User Bubble
  if (elements.chatSimulatorBody) {
    elements.chatSimulatorBody.innerHTML += `
      <div class="chat-bubble user-bubble">
        <div class="bubble-sender">${escapeHtml(userName)}</div>
        <div class="bubble-text">${escapeHtml(message)}</div>
      </div>
    `;
    elements.chatSimulatorBody.scrollTop = elements.chatSimulatorBody.scrollHeight;
  }

  elements.chatSimulatorInput.value = '';

  // 2. Call Simulate API
  try {
    const { ok, data } = await safeApiRequest('/api/line/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectUser,
        userName,
        message,
      }),
    });

    if (ok && data) {
      const formattedReply = escapeHtml(data.replyText).replace(/\n/g, '<br/>');
      if (elements.chatSimulatorBody) {
        elements.chatSimulatorBody.innerHTML += `
          <div class="chat-bubble bot-bubble">
            <div class="bubble-sender">🤖 JIT LINE Bot</div>
            <div class="bubble-text">${formattedReply}</div>
          </div>
        `;
        elements.chatSimulatorBody.scrollTop = elements.chatSimulatorBody.scrollHeight;
      }

      // If a ticket was created, instantly update the ticket board!
      if (data.ticketCreated) {
        fetchTickets();
      }
    }
  } catch (err) {
    if (elements.chatSimulatorBody) {
      elements.chatSimulatorBody.innerHTML += `
        <div class="chat-bubble bot-bubble" style="border-color:#f87171;">
          <div class="bubble-sender" style="color:#f87171;">⚠️ 系統錯誤</div>
          <div class="bubble-text">${escapeHtml(err.message)}</div>
        </div>
      `;
      elements.chatSimulatorBody.scrollTop = elements.chatSimulatorBody.scrollHeight;
    }
  }
}

// ==========================================================================
// AI Agent Prompt Dispatcher (Claude Code / Codex / Gemini CLI)
// ==========================================================================

window.copyAgentPrompt = function (ticketId) {
  const t = state.tickets.find((x) => x.id === ticketId);
  if (!t) return;
  const promptText = `請使用 JIT API 引擎處理工單 [${t.id}]：
- 提單人: ${t.userName} (${t.role || 'client'}, 公司: ${t.company || '未指定'})
- 目標路由: ${t.targetRoute || '/api/new_endpoint'}
- 優先級: ${t.priorityLevel || 'P2'}
- Jev 三維指標: 重要性 ${t.importanceScore !== undefined ? t.importanceScore : 50}/100 (${t.importanceLevel || 'MEDIUM'}), 急迫性 ${t.urgencyScore !== undefined ? t.urgencyScore : 50}/100 (${t.urgencyLevel || 'MEDIUM'}), 危險性 ${t.riskScore !== undefined ? t.riskScore : 20}/100 (${t.riskLevel || 'LOW'})
- 處置建議: ${t.triageAdvice || t.triageAction || 'AI_AGENT_AUTONOMOUS'}
- 情境分析: ${t.situationSummary || '無'}
- 需求描述: ${t.message}
${t.jevReview?.suggestedPatch ? `\n- Jev 建議規格:\n\`\`\`markdown\n${t.jevReview.suggestedPatch}\n\`\`\`` : ''}

請在 specs/ 目錄中撰寫或修改對應的 Markdown API 規格，並執行 ./run.sh 或 npm test 驗證通過。`;

  navigator.clipboard.writeText(promptText);
  alert(`📋 已複製工單 ${ticketId} 的 AI Agent Prompt！\n可直接貼入 Claude Code / Codex / Gemini CLI 終端執行！`);
};

// ==========================================================================
// Master Authentication & Security Session Management
// ==========================================================================

function setupMasterAuth() {
  if (elements.masterAuthPill) {
    elements.masterAuthPill.addEventListener('click', () => {
      if (state.masterAuth.authenticated) {
        if (confirm('目前已登入 Master 身分。是否要登出切換回訪客模式？')) {
          logoutMaster();
        }
      } else {
        showMasterLoginModal();
      }
    });
  }

  if (elements.closeMasterModalBtn) {
    elements.closeMasterModalBtn.addEventListener('click', hideMasterLoginModal);
  }
  if (elements.cancelMasterModalBtn) {
    elements.cancelMasterModalBtn.addEventListener('click', hideMasterLoginModal);
  }
  if (elements.submitMasterLoginBtn) {
    elements.submitMasterLoginBtn.addEventListener('click', submitMasterLogin);
  }
  if (elements.masterPasswordInput) {
    elements.masterPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitMasterLogin();
    });
  }
}

function showMasterLoginModal() {
  if (elements.masterLoginModal) {
    elements.masterLoginModal.classList.add('active');
  }
  if (elements.masterLoginAlert) {
    elements.masterLoginAlert.style.display = 'none';
    elements.masterLoginAlert.textContent = '';
  }
  if (elements.masterPasswordInput) {
    elements.masterPasswordInput.value = '';
    setTimeout(() => elements.masterPasswordInput.focus(), 100);
  }
}

function hideMasterLoginModal() {
  if (elements.masterLoginModal) {
    elements.masterLoginModal.classList.remove('active');
  }
}

async function fetchAuthStatus() {
  try {
    const { ok, data } = await safeApiRequest('/api/auth/status');
    if (ok && data) {
      state.masterAuth.authenticated = !!data.authenticated;
      state.masterAuth.role = data.role || (data.authenticated ? 'master' : 'guest');
      state.masterAuth.requiresLogin = !data.authenticated;
      updateAuthUI();
    }
  } catch (err) {
    console.warn('Failed to fetch auth status:', err);
  }
}

function updateAuthUI() {
  if (!elements.masterAuthPill) return;
  if (state.masterAuth.authenticated) {
    elements.masterAuthPill.className = 'status-pill status-auth status-auth-active';
    if (elements.masterAuthIcon) elements.masterAuthIcon.textContent = '👑';
    if (elements.masterAuthText) elements.masterAuthText.textContent = 'Master (已授權)';
    elements.masterAuthPill.title = '點擊登出 Master 權限';
  } else {
    elements.masterAuthPill.className = 'status-pill status-auth';
    if (elements.masterAuthIcon) elements.masterAuthIcon.textContent = '🔒';
    if (elements.masterAuthText) elements.masterAuthText.textContent = '訪客模式 (點擊登入)';
    elements.masterAuthPill.title = '點擊登入解鎖 Master 治理權限';
  }
}

async function submitMasterLogin() {
  const pwd = elements.masterPasswordInput ? elements.masterPasswordInput.value.trim() : '';
  if (!pwd) {
    if (elements.masterLoginAlert) {
      elements.masterLoginAlert.style.display = 'block';
      elements.masterLoginAlert.textContent = '請輸入 Master 密碼！';
    }
    return;
  }

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await resp.json();
    if (resp.ok && data.success) {
      state.masterAuth.authenticated = true;
      state.masterAuth.token = data.token;
      state.masterAuth.role = 'master';
      localStorage.setItem('jit_master_token', data.token);
      hideMasterLoginModal();
      updateAuthUI();
      alert('🎉 Master 認證成功！已解鎖全域管理與編譯權限。');
      refreshAll();
    } else {
      if (elements.masterLoginAlert) {
        elements.masterLoginAlert.style.display = 'block';
        elements.masterLoginAlert.textContent = data.error || '密碼錯誤，請重新確認！';
      }
    }
  } catch (err) {
    if (elements.masterLoginAlert) {
      elements.masterLoginAlert.style.display = 'block';
      elements.masterLoginAlert.textContent = `認證異常: ${err.message}`;
    }
  }
}

async function logoutMaster() {
  try {
    await safeApiRequest('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  state.masterAuth.authenticated = false;
  state.masterAuth.token = '';
  state.masterAuth.role = 'guest';
  localStorage.removeItem('jit_master_token');
  updateAuthUI();
  alert('已登出 Master 身分，已切換回訪客唯讀模式。');
  refreshAll();
}

// ==========================================================================
// Upstream Third-Party Secrets & Multi-Tenant Management
// ==========================================================================

function setupUpstreamWorkspace() {
  if (elements.saveSecretBtn) {
    elements.saveSecretBtn.addEventListener('click', saveUpstreamSecret);
  }
  if (elements.createTenantBtn) {
    elements.createTenantBtn.addEventListener('click', createTenant);
  }
}

async function updateUpstreamWorkspace() {
  await Promise.all([
    fetchUpstreamSecrets(),
    fetchTenants(),
  ]);
}

async function fetchUpstreamSecrets() {
  if (!elements.upstreamSecretsContainer) return;
  try {
    const { ok, data } = await safeApiRequest('/api/upstream/secrets');
    if (ok && Array.isArray(data)) {
      state.upstreamSecrets = data;
      renderUpstreamSecrets();
    }
  } catch (err) {
    elements.upstreamSecretsContainer.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);">${escapeHtml(err.message)}</div>`;
  }
}

function renderUpstreamSecrets() {
  if (!elements.upstreamSecretsContainer) return;
  if (!state.upstreamSecrets || state.upstreamSecrets.length === 0) {
    elements.upstreamSecretsContainer.innerHTML = `
      <div style="font-size:11px;color:var(--text-tertiary);padding:12px;text-align:center;">
        尚未設定 Upstream 第三方金鑰。可在下方新增或透過環境變數 (UPSTREAM_*) 注入。
      </div>
    `;
    return;
  }

  elements.upstreamSecretsContainer.innerHTML = state.upstreamSecrets
    .map(
      (s) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;margin-bottom:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:6px;font-size:11px;">
        <div>
          <span style="font-family:var(--font-mono);font-weight:600;color:var(--color-primary);">${escapeHtml(s.ref)}</span>
          <span style="color:var(--text-tertiary);margin-left:8px;">${escapeHtml(s.maskedValue)}</span>
          <span style="margin-left:6px;font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.05);color:var(--text-secondary);">${escapeHtml(s.source)}</span>
        </div>
        ${
          s.source === 'local_json'
            ? `<button class="secondary-btn" style="padding:2px 8px;font-size:10px;color:#f87171;" onclick="deleteUpstreamSecret('${escapeHtml(s.ref)}')">刪除</button>`
            : `<span style="font-size:10px;color:var(--text-tertiary);">唯讀 (ENV/HF)</span>`
        }
      </div>
    `
    )
    .join('');
}

async function saveUpstreamSecret() {
  const ref = elements.newSecretRef ? elements.newSecretRef.value.trim() : '';
  const value = elements.newSecretVal ? elements.newSecretVal.value.trim() : '';
  if (!ref || !value) {
    alert('請填寫機密代號與密鑰值！');
    return;
  }

  try {
    const { ok } = await safeApiRequest('/api/upstream/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, value }),
    });
    if (ok) {
      if (elements.newSecretRef) elements.newSecretRef.value = '';
      if (elements.newSecretVal) elements.newSecretVal.value = '';
      alert(`✅ 機密 ${ref} 已安全儲存於 .jit/upstream_secrets.json！`);
      fetchUpstreamSecrets();
    }
  } catch (err) {
    alert(`儲存失敗: ${err.message}`);
  }
}

window.deleteUpstreamSecret = async function (ref) {
  if (!confirm(`確定要刪除機密金鑰 ${ref} 嗎？`)) return;
  try {
    const { ok } = await safeApiRequest(`/api/upstream/secrets/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
    });
    if (ok) {
      fetchUpstreamSecrets();
    }
  } catch (err) {
    alert(`刪除失敗: ${err.message}`);
  }
};

async function fetchTenants() {
  if (!elements.tenantsTableBody) return;
  try {
    const { ok, data } = await safeApiRequest('/api/tenants');
    if (ok && Array.isArray(data)) {
      state.tenants = data;
      renderTenants();
    }
  } catch (err) {
    elements.tenantsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTenants() {
  if (!elements.tenantsTableBody) return;
  if (!state.tenants || state.tenants.length === 0) {
    elements.tenantsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:11px;">
          尚未配置多租戶 API Key。請在下方建立第一個租戶（如客戶或 PM）。
        </td>
      </tr>
    `;
    return;
  }

  elements.tenantsTableBody.innerHTML = state.tenants
    .map((t) => {
      const routesStr = t.allowedRoutes && t.allowedRoutes.length > 0 ? t.allowedRoutes.join(', ') : '*';
      const rateStr = t.rateLimit ? `${t.rateLimit.requestsPerMinute || 60}/分, ${t.rateLimit.dailyQuota || '無'}/日` : '預設 (60/分)';
      const apiKeyPreview = t.apiKey ? `${t.apiKey.slice(0, 10)}...` : 'sk_live_****';
      return `
        <tr>
          <td><strong style="color:var(--color-primary);">${escapeHtml(t.name)}</strong></td>
          <td><span class="user-role-tag badge-${escapeHtml(t.role)}">${escapeHtml(t.role.toUpperCase())}</span></td>
          <td>
            <code>${escapeHtml(apiKeyPreview)}</code>
            <button class="secondary-btn" style="padding:1px 4px;font-size:9px;margin-left:4px;" onclick="copyApiKey('${escapeHtml(t.apiKey || '')}')">複製</button>
          </td>
          <td><span style="font-size:10px;">${escapeHtml(routesStr)}</span></td>
          <td><span style="font-size:10px;">${escapeHtml(rateStr)}</span></td>
          <td>
            <button class="secondary-btn" style="padding:2px 6px;font-size:10px;color:#f87171;" onclick="deleteTenant('${escapeHtml(t.id)}')">刪除</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

window.copyApiKey = function (key) {
  if (!key) {
    alert('此金鑰已遮罩保護');
    return;
  }
  navigator.clipboard.writeText(key);
  alert('已複製 API Key 到剪貼簿！');
};

async function createTenant() {
  const name = elements.newTenantName ? elements.newTenantName.value.trim() : '';
  const role = elements.newTenantRole ? elements.newTenantRole.value : 'client';
  const routesRaw = elements.newTenantRoutes ? elements.newTenantRoutes.value.trim() : '';
  const rateRaw = elements.newTenantRate ? elements.newTenantRate.value.trim() : '';

  if (!name) {
    alert('請填寫租戶名稱！');
    return;
  }

  const allowedRoutes = routesRaw ? routesRaw.split(',').map((s) => s.trim()).filter(Boolean) : ['*'];
  let rateLimit = undefined;
  if (rateRaw) {
    const parts = rateRaw.split(',').map((s) => s.trim());
    const rpm = parseInt(parts[0], 10);
    const daily = parts[1] ? parseInt(parts[1], 10) : undefined;
    if (!isNaN(rpm)) {
      rateLimit = { requestsPerMinute: rpm, dailyQuota: daily };
    }
  }

  try {
    const { ok, data } = await safeApiRequest('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, allowedRoutes, rateLimit }),
    });
    if (ok && data) {
      if (elements.newTenantName) elements.newTenantName.value = '';
      if (elements.newTenantRoutes) elements.newTenantRoutes.value = '';
      if (elements.newTenantRate) elements.newTenantRate.value = '';
      alert(`🎉 租戶 ${name} 建立成功！\n生成的完整 API Key:\n${data.apiKey}\n\n請妥善保存，此 Key 僅展示一次！`);
      fetchTenants();
    }
  } catch (err) {
    alert(`建立租戶失敗: ${err.message}`);
  }
}

window.deleteTenant = async function (id) {
  if (!confirm(`確定要廢止租戶 ${id} 及其 API Key 嗎？`)) return;
  try {
    const { ok } = await safeApiRequest(`/api/tenants/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (ok) {
      fetchTenants();
    }
  } catch (err) {
    alert(`廢止失敗: ${err.message}`);
  }
};



