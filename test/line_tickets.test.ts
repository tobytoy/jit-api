import { describe, expect, it } from 'vitest';
import { TicketStore, LineService, JevReviewer } from '../core/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('LINE Control Center & TypeSafe Jev Decision Engine', () => {
  const testStorageDir = path.resolve(process.cwd(), 'TMP/test_line_' + Date.now());

  it('should manage whitelist and ticket lifecycle in TicketStore', () => {
    const store = new TicketStore(testStorageDir);

    // 1. Whitelist management
    expect(store.isWhitelisted('U_DEV_LEAD')).toBe(true);
    expect(store.isWhitelisted('U_STRANGER')).toBe(false);

    store.addWhitelistUser({
      id: 'U_STRANGER',
      name: 'New Collaborator',
      role: 'client',
      addedAt: Date.now(),
    });
    expect(store.isWhitelisted('U_STRANGER')).toBe(true);

    store.removeWhitelistUser('U_STRANGER');
    expect(store.isWhitelisted('U_STRANGER')).toBe(false);

    // 2. Ticket creation
    const ticket = store.createTicket({
      source: 'simulator',
      userId: 'U_FRONTEND_ALICE',
      userName: 'Frontend Alice',
      message: '請在 /api/orders 增加 couponCode string 欄位',
      targetRoute: '/api/orders',
    });

    expect(ticket.id).toMatch(/^TKT-\d+/);
    expect(ticket.status).toBe('PENDING');
    expect(ticket.message).toContain('couponCode');

    // 3. Status update
    const updated = store.updateTicket(ticket.id, {
      status: 'APPROVED',
      masterNotes: 'Master approved coupon code',
    });
    expect(updated?.status).toBe('APPROVED');
    expect(store.getTicket(ticket.id)?.status).toBe('APPROVED');
  });

  it('should enforce access whitelist and block unauthorized callers in LineService', async () => {
    const store = new TicketStore(testStorageDir);
    const lineService = new LineService({ ticketStore: store, storageDir: testStorageDir });

    // Unauthorized user
    const blockedRes = await lineService.handleMessage({
      source: 'line',
      userId: 'U_UNKNOWN_ATTACKER',
      userName: 'Unknown Person',
      message: '查詢 /api/users',
    });

    expect(blockedRes.actionTaken).toBe('WHITELIST_BLOCKED');
    expect(blockedRes.replyText).toContain('尚未列入 Master 白名單');
  });

  it('should auto-reply to known API queries with schema and traffic light in LineService', async () => {
    const store = new TicketStore(testStorageDir);
    const lineService = new LineService({ ticketStore: store, storageDir: testStorageDir });

    // Query specific route
    const queryRouteRes = await lineService.handleMessage({
      source: 'simulator',
      userId: 'U_FRONTEND_ALICE',
      userName: 'Frontend Alice',
      message: '查詢 /api/users',
    });

    expect(queryRouteRes.actionTaken).toBe('QUERY_REPLIED');
    expect(queryRouteRes.replyText).toContain('API 規格速查');
    expect(queryRouteRes.replyText).toContain('/api/users');
    expect(queryRouteRes.replyText).toContain('協同燈號');

    // Query general route list
    const queryAllRes = await lineService.handleMessage({
      source: 'simulator',
      userId: 'U_FRONTEND_ALICE',
      userName: 'Frontend Alice',
      message: '查目前 API 狀態與燈號',
    });

    expect(queryAllRes.actionTaken).toBe('QUERY_REPLIED');
    expect(queryAllRes.replyText).toContain('JIT API 總覽與燈號');
  });

  it('should automatically generate a ticket (#TKT-xxxx) when collaborator submits a new feature or modification', async () => {
    const store = new TicketStore(testStorageDir);
    const lineService = new LineService({ ticketStore: store, storageDir: testStorageDir });

    const ticketRes = await lineService.handleMessage({
      source: 'simulator',
      userId: 'U_FRONTEND_ALICE',
      userName: 'Frontend Alice',
      message: '請在 /api/orders 增加 discountRate float 欄位並支援折抵',
    });

    expect(ticketRes.actionTaken).toBe('TICKET_CREATED');
    expect(ticketRes.ticketCreated).toBeDefined();
    expect(ticketRes.ticketCreated?.id).toMatch(/^TKT-\d+/);
    expect(ticketRes.replyText).toContain('JIT 工單受理成功');
    expect(ticketRes.replyText).toContain(ticketRes.ticketCreated!.id);

    // Verify it exists in store and has 3 metrics calculated
    const ticketInStore = store.getTicket(ticketRes.ticketCreated!.id);
    expect(ticketInStore).toBeDefined();
    expect(ticketInStore?.targetRoute).toBe('/api/orders');
    expect(ticketInStore?.importanceScore).toBeDefined();
    expect(ticketInStore?.importanceLevel).toBeDefined();
    expect(ticketInStore?.urgencyScore).toBeDefined();
    expect(ticketInStore?.urgencyLevel).toBeDefined();
    expect(ticketInStore?.riskScore).toBeDefined();
    expect(ticketInStore?.riskLevel).toBeDefined();
    expect(ticketInStore?.triageAdvice).toBeDefined();

    // Verify replyText includes 3 metrics
    expect(ticketRes.replyText).toContain('【Jev 三維評定指標】');
    expect(ticketRes.replyText).toContain('重要性：');
    expect(ticketRes.replyText).toContain('急迫性：');
    expect(ticketRes.replyText).toContain('危險性：');
    expect(ticketRes.replyText).toContain('處置建議：');
  });

  it('should execute TypeSafe Jev structured review and output decision, scores, and spec patch', async () => {
    const reviewer = new JevReviewer();
    const existingRoutes = [
      {
        path: '/api/orders',
        description: 'Order processing endpoint',
      },
    ];

    // Case 1: Malicious payload -> Noul guardrail triggers HIGH_BREAKING_RISK
    const maliciousTicket = {
      id: 'TKT-9999',
      source: 'simulator' as const,
      userId: 'U_DEV_LEAD',
      userName: 'Test User',
      timestamp: Date.now(),
      message: "'; DROP TABLE orders; -- exec('rm -rf /')",
      intent: 'MODIFY_API' as const,
      status: 'PENDING' as const,
    };

    const maliciousReview = await reviewer.reviewTicket(maliciousTicket, existingRoutes);
    expect(maliciousReview.decision).toBe('HIGH_BREAKING_RISK');
    expect(maliciousReview.breakingRisk).toBeGreaterThan(0.7);

    // Case 2: Vague request -> NEED_MORE_INFO
    const vagueTicket = {
      id: 'TKT-9998',
      source: 'simulator' as const,
      userId: 'U_DEV_LEAD',
      userName: 'Test User',
      timestamp: Date.now(),
      message: '加欄位',
      intent: 'MODIFY_API' as const,
      status: 'PENDING' as const,
    };
    const vagueReview = await reviewer.reviewTicket(vagueTicket, existingRoutes);
    expect(vagueReview.decision).toBe('NEED_MORE_INFO');
    expect(vagueReview.missingDetails?.length).toBeGreaterThan(0);

    // Case 3: Sensible addition to existing endpoint -> MODIFY_EXISTING_ENDPOINT
    const validTicket = {
      id: 'TKT-9997',
      source: 'simulator' as const,
      userId: 'U_FRONTEND_ALICE',
      userName: 'Frontend Alice',
      timestamp: Date.now(),
      message: '請在 /api/orders 增加 couponCode string 欄位',
      intent: 'MODIFY_API' as const,
      targetRoute: '/api/orders',
      status: 'PENDING' as const,
    };
    const validReview = await reviewer.reviewTicket(validTicket, existingRoutes);
    expect(validReview.decision).toBe('MODIFY_EXISTING_ENDPOINT');
    expect(validReview.compatibilityScore).toBeGreaterThanOrEqual(0.8);
    expect(validReview.breakingRisk).toBeLessThanOrEqual(0.2);
    expect(validReview.suggestedPatch).toContain('couponCode');
    expect(validReview.importanceScore).toBeDefined();
    expect(validReview.urgencyScore).toBeDefined();
    expect(validReview.riskScore).toBeDefined();
    expect(validReview.triageAdvice).toBeDefined();
  });

  it('should evaluate 3 explicit indicators (Importance, Urgency, Risk) and yield tailored triage advice', async () => {
    const reviewer = new JevReviewer();
    const existingRoutes = [{ path: '/api/orders', description: 'Order processing endpoint' }];

    // 1. High Risk / Breaking Change -> DISCUSS_WEEKLY_MEETING
    const breakingTicket = {
      id: 'TKT-8001',
      source: 'simulator' as const,
      userId: 'U_FRONTEND_ALICE',
      userName: 'Alice',
      timestamp: Date.now(),
      message: '請把 /api/orders 既有的 orderId 欄位刪除，改回傳純數字',
      intent: 'MODIFY_API' as const,
      targetRoute: '/api/orders',
      status: 'PENDING' as const,
    };
    const breakingReview = await reviewer.reviewTicket(breakingTicket, existingRoutes);
    expect(breakingReview.riskLevel).toBe('HIGH');
    expect(breakingReview.triageAction).toBe('DISCUSS_WEEKLY_MEETING');
    expect(breakingReview.triageAdvice).toContain('週會');

    // 2. Critical Emergency + Low Risk -> MASTER_DIRECT_HANDLE
    const emergencyTicket = {
      id: 'TKT-8002',
      source: 'simulator' as const,
      userId: 'U_FRONTEND_ALICE',
      userName: 'Alice',
      timestamp: Date.now(),
      message: '緊急！線上崩潰 crash 500 無法結帳，請修復訂單路由參數驗證！',
      intent: 'MODIFY_API' as const,
      targetRoute: '/api/orders',
      status: 'PENDING' as const,
    };
    const emergencyReview = await reviewer.reviewTicket(emergencyTicket, existingRoutes);
    expect(emergencyReview.urgencyLevel).toBe('CRITICAL');
    expect(emergencyReview.triageAction).toBe('MASTER_DIRECT_HANDLE');
    expect(emergencyReview.triageAdvice).toContain('Master 立即');

    // 3. High Importance + Safe/New Endpoint -> AI_AGENT_AUTONOMOUS
    const pmTicket = {
      id: 'TKT-8003',
      source: 'simulator' as const,
      userId: 'U_PM_BOB',
      userName: 'PM Bob',
      role: 'pm' as const,
      timestamp: Date.now(),
      message: '新增 /api/promotions 促銷活動列表與折價券查詢',
      intent: 'NEW_API' as const,
      targetRoute: '/api/promotions',
      status: 'PENDING' as const,
    };
    const pmReview = await reviewer.reviewTicket(pmTicket, existingRoutes);
    expect(pmReview.importanceLevel).toBe('HIGH');
    expect(pmReview.riskLevel).toBe('LOW');
    expect(pmReview.triageAction).toBe('AI_AGENT_AUTONOMOUS');
    expect(pmReview.triageAdvice).toContain('AI Agent');

    // 4. Vague / Low Value -> REJECT
    const vagueTicket = {
      id: 'TKT-8004',
      source: 'simulator' as const,
      userId: 'U_DEV_LEAD',
      userName: 'Dev',
      timestamp: Date.now(),
      message: '改一下',
      intent: 'MODIFY_API' as const,
      status: 'PENDING' as const,
    };
    const vagueReview = await reviewer.reviewTicket(vagueTicket, existingRoutes);
    expect(vagueReview.triageAction).toBe('REJECT');
    expect(vagueReview.triageAdvice).toContain('駁回');
  });
});
