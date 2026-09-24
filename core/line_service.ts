import { TicketStore, LineTicket } from './ticket_store.js';
import { TrafficLightManager } from './coordination.js';
import { JITEngine } from './jit_engine.js';
import { JevReviewer } from './jev_reviewer.js';
import * as fs from 'fs';
import * as path from 'path';

export interface LineBotConfig {
  channelSecret: string;
  channelAccessToken: string;
  webhookUrl: string;
  autoReplyEnabled: boolean;
  whitelistOnly: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'SIMULATION_ONLY';
}

export interface LineMessageResponse {
  replyText: string;
  ticketCreated?: LineTicket;
  actionTaken: 'QUERY_REPLIED' | 'TICKET_CREATED' | 'WHITELIST_BLOCKED' | 'HELP_REPLIED';
}

export class LineService {
  private ticketStore: TicketStore;
  private trafficLightManager?: TrafficLightManager;
  private jitEngine?: JITEngine;
  private jevReviewer?: JevReviewer;
  private config: LineBotConfig;
  private configFile: string;

  constructor(options?: {
    ticketStore?: TicketStore;
    trafficLightManager?: TrafficLightManager;
    jitEngine?: JITEngine;
    jevReviewer?: JevReviewer;
    storageDir?: string;
  }) {
    this.ticketStore = options?.ticketStore || new TicketStore(options?.storageDir);
    this.trafficLightManager = options?.trafficLightManager;
    this.jitEngine = options?.jitEngine;
    this.jevReviewer = options?.jevReviewer || new JevReviewer();

    const baseDir = options?.storageDir || path.resolve(process.cwd(), '.jit');
    this.configFile = path.join(baseDir, 'line_config.json');

    this.config = {
      channelSecret: process.env.LINE_CHANNEL_SECRET || '',
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
      webhookUrl: process.env.LINE_WEBHOOK_URL || '',
      autoReplyEnabled: true,
      whitelistOnly: true,
      status: process.env.LINE_CHANNEL_SECRET ? 'CONNECTED' : 'SIMULATION_ONLY',
    };

    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const saved = JSON.parse(raw);
        this.config = { ...this.config, ...saved };
      }
    } catch {
      // Ignored
    }
  }

  public saveConfig(updates: Partial<LineBotConfig>): LineBotConfig {
    this.config = { ...this.config, ...updates };
    try {
      const dir = path.dirname(this.configFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch {
      // Ignored
    }
    return this.config;
  }

  public getConfig(): LineBotConfig {
    return { ...this.config };
  }

  public getTicketStore(): TicketStore {
    return this.ticketStore;
  }

  /**
   * Main dispatch for handling messages from LINE Webhook or In-Studio Simulator
   */
  public async handleMessage(payload: {
    source: 'line' | 'simulator';
    userId: string;
    userName: string;
    message: string;
  }): Promise<LineMessageResponse> {
    const raw = payload.message.trim();
    const userId = payload.userId || 'U_ANONYMOUS';
    const userName = payload.userName || '協同開發者';
    const user = this.ticketStore.getWhitelistUser(userId);
    const role = user?.role || 'client';

    // 1. Whitelist Check
    if (this.config.whitelistOnly && !this.ticketStore.isWhitelisted(userId)) {
      return {
        replyText: `🚫 抱歉【${userName}】，您的 LINE 帳號尚未列入 Master 白名單。\n請聯繫 Master 工程師於 Web Studio 控制中心開通權限。`,
        actionTaken: 'WHITELIST_BLOCKED',
      };
    }

    // 2. Identify Target Route in text (e.g. /api/users, /api/orders)
    const routeMatch = raw.match(/\/api\/[a-zA-Z0-9_\-/]+/);
    const targetRoute = routeMatch ? routeMatch[0] : undefined;

    // 3. Query Intent Detection (e.g. 查詢, 查狀態, 查參數, 查規格, /api/xxx)
    const isQuery =
      /^(請問|詢問|查詢|查|狀態|規格|參數|list|api|help|\?|說明)/i.test(raw) ||
      raw.includes('有哪些') ||
      raw.includes('可以用') ||
      raw.includes('可用的') ||
      (raw.startsWith('/') && !raw.includes('加') && !raw.includes('修改') && !raw.includes('新增'));

    if (isQuery) {
      const reply = this.handleQueryIntent(raw, targetRoute, user);
      return {
        replyText: reply,
        actionTaken: 'QUERY_REPLIED',
      };
    }

    // 4. Mutation Intent (New API, Modify API, Add field) -> Auto Ticket Creation
    const isNew = /(新增|建立|開一個|new\s+api|create)/i.test(raw);
    const intent = isNew ? 'NEW_API' : 'MODIFY_API';

    let ticket = this.ticketStore.createTicket({
      source: payload.source,
      userId,
      userName,
      role,
      message: raw,
      intent,
      targetRoute: targetRoute || (isNew ? '/api/new_endpoint' : '/api/general'),
    });

    // 5. Automated TypeSafe Jev Structured Review & Importance Scoring
    let reviewResult;
    if (this.jevReviewer) {
      const existingRoutes = this.jitEngine
        ? this.jitEngine.getRoutes().map((r) => ({
            path: r.route,
            description: r.description,
            schema: r.samplePayload,
          }))
        : [];

      reviewResult = await this.jevReviewer.reviewTicket(ticket, existingRoutes);

      const status =
        reviewResult.decision === 'HIGH_BREAKING_RISK'
          ? 'REJECTED'
          : 'PENDING';

      ticket = this.ticketStore.updateTicket(ticket.id, {
        status,
        jevReview: reviewResult,
        importanceScore: reviewResult.importanceScore,
        importanceLevel: reviewResult.importanceLevel,
        urgencyScore: reviewResult.urgencyScore,
        urgencyLevel: reviewResult.urgencyLevel,
        riskScore: reviewResult.riskScore,
        riskLevel: reviewResult.riskLevel,
        priorityLevel: reviewResult.priorityLevel,
        urgency: reviewResult.urgency,
        situationSummary: reviewResult.situationSummary,
        triageAction: reviewResult.triageAction,
        triageAdvice: reviewResult.triageAdvice,
      }) || ticket;
    }

    const priorityBadge = ticket.priorityLevel ? `[${ticket.priorityLevel}]` : '[P2]';
    const impText = ticket.importanceScore !== undefined ? `${ticket.importanceScore}/100 (${ticket.importanceLevel || 'MEDIUM'})` : '75/100 (MEDIUM)';
    const urgText = ticket.urgencyScore !== undefined ? `${ticket.urgencyScore}/100 (${ticket.urgencyLevel || 'MEDIUM'})` : '50/100 (MEDIUM)';
    const riskText = ticket.riskScore !== undefined ? `${ticket.riskScore}/100 (${ticket.riskLevel || 'LOW'})` : '10/100 (LOW)';

    const triageTextMap: Record<string, string> = {
      DISCUSS_WEEKLY_MEETING: '📅 週會討論 (破壞性變更)',
      MASTER_DIRECT_HANDLE: '⚡ Master 立即處置 (急迫且低危險)',
      AI_AGENT_AUTONOMOUS: '🤖 交由 AI Agent 處理',
      REJECT: '❌ 建議駁回 (資訊不足/重複)',
    };
    const triageBadge = triageTextMap[ticket.triageAction || ''] || ticket.triageAction || '🤖 交由 AI Agent 處理';

    const replyText = [
      `📋 【JIT 工單受理成功 ${priorityBadge}】`,
      `━━━━━━━━━━━━━━━━━━`,
      `🔹 工單編號：${ticket.id} (${userName} · ${role.toUpperCase()})`,
      `🔹 目標路由：${ticket.targetRoute}`,
      `🔹 需求描述：${raw}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📊 【Jev 三維評定指標】`,
      `🌟 重要性：${impText}`,
      `⏰ 急迫性：${urgText}`,
      `⚠️ 危險性：${riskText}`,
      `━━━━━━━━━━━━━━━━━━`,
      `💡 處置建議：${triageBadge}`,
      `📝 建議說明：${ticket.triageAdvice || ticket.situationSummary || '已受理工單，等待進一步處置'}`,
      `━━━━━━━━━━━━━━━━━━`,
      `⏳ 目前狀態：【${ticket.status}】`,
      `💡 Master 可在 Studio 批准或指派 AI Agent (Claude Code / Codex / Gemini) 自動生成！`,
    ].join('\n');

    return {
      replyText,
      ticketCreated: ticket,
      actionTaken: 'TICKET_CREATED',
    };
  }

  private handleQueryIntent(raw: string, targetRoute?: string, user?: { role: string; allowedApis?: string[] }): string {
    const routeList: Array<{
      route: string;
      description: string;
      phase: string;
      samplePayload?: Record<string, unknown>;
      lightColor: 'GREEN' | 'YELLOW' | 'RED';
    }> = [];

    if (this.jitEngine) {
      const routes = this.jitEngine.getRoutes();
      for (const r of routes) {
        const routeStatus = this.jitEngine.getRouteStatus(r.route);
        routeList.push({
          route: r.route,
          description: r.description || 'JIT Dynamic Route',
          phase: routeStatus.trafficLight.phase || 'Phase 1',
          samplePayload: r.samplePayload,
          lightColor: routeStatus.trafficLight.color,
        });
      }
    } else {
      routeList.push(
        {
          route: '/api/users',
          description: '用戶資料存取端點',
          phase: 'Phase 3 (Static)',
          samplePayload: { userId: 'usr_123', name: 'Alice' },
          lightColor: 'GREEN',
        },
        {
          route: '/api/orders',
          description: '訂單處理端點',
          phase: 'Phase 2 (Observing)',
          samplePayload: { orderId: 'ord_999', amount: 500 },
          lightColor: 'YELLOW',
        }
      );
    }

    // Case A: Query specific route
    if (targetRoute) {
      // Role check for client
      if (user?.role === 'client' && user.allowedApis && !user.allowedApis.includes('*') && !user.allowedApis.includes(targetRoute)) {
        return `🔒 【權限受限】抱歉，您的帳號為【客戶端身分】，僅獲授權存取專屬端點 [${user.allowedApis.join(', ')}]，無權調閱 ${targetRoute}。如有新增需求可直接在 LINE 提單由 PM 與 Master 評審。`;
      }

      const found = routeList.find((r) => r.route === targetRoute);
      if (found) {
        const lightIcon =
          found.lightColor === 'RED'
            ? '🔴 紅燈 (鎖定測試中)'
            : found.lightColor === 'YELLOW'
            ? '🟡 黃燈 (動態協商中)'
            : '🟢 綠燈 (就緒/已同步)';

        const sample = found.samplePayload
          ? Object.entries(found.samplePayload)
              .map(([k, v]) => `   • ${k}: ${typeof v}`)
              .join('\n')
          : '   • (無特定參數或自由格式)';

        return [
          `🔍 【API 規格速查】`,
          `━━━━━━━━━━━━━━━━━━`,
          `📌 路由：${found.route}`,
          `🚦 協同燈號：${lightIcon}`,
          `⚡ 生命週期：${found.phase}`,
          `📝 參數範例：`,
          sample,
          `━━━━━━━━━━━━━━━━━━`,
          `💡 如需擴充欄位，可直接於 LINE 輸入需求，例如：「請在 ${found.route} 增加 couponCode string 欄位」`,
        ].join('\n');
      } else {
        return `⚠️ 找不到端點【${targetRoute}】。\n目前可用路由：${routeList.map((r) => r.route).join(', ')}`;
      }
    }

    // Case B: General Route List (Filter by role)
    let visibleRoutes = routeList;
    if (user?.role === 'client' && user.allowedApis && !user.allowedApis.includes('*')) {
      visibleRoutes = routeList.filter((r) => user.allowedApis?.includes(r.route));
    }

    const routeSummary = visibleRoutes.length > 0
      ? visibleRoutes
          .map((r) => {
            const icon = r.lightColor === 'RED' ? '🔴' : r.lightColor === 'YELLOW' ? '🟡' : '🟢';
            return `• ${icon} ${r.route} (${r.phase})`;
          })
          .join('\n')
      : '• (目前尚無對您開放的端點，請聯絡 PM 開通)';

    const roleNotice = user?.role === 'client' ? ` (👤 客戶授權檢視)` : ` (🛡️ ${user?.role ? user.role.toUpperCase() : 'ALL'} 檢視)`;

    return [
      `🤖 【JIT API 總覽與燈號${roleNotice}】`,
      `━━━━━━━━━━━━━━━━━━`,
      routeSummary,
      `━━━━━━━━━━━━━━━━━━`,
      `🟢 綠燈: 就緒 | 🟡 黃燈: 協商中 | 🔴 紅燈: 鎖定壓測中`,
      `👉 查詢單一規格：輸入「查詢 /api/users」`,
      `👉 提出需求：輸入「請在 /api/orders 增加 discountCode 欄位」`,
    ].join('\n');
  }
}
