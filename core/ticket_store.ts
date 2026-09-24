import * as fs from 'fs';
import * as path from 'path';

export type TicketStatus = 'PENDING' | 'EVALUATING' | 'APPROVED' | 'REJECTED' | 'SYNTHESIZED';

export interface JevReviewResult {
  decision: 'APPROVE_AND_DRAFT_SPEC' | 'MODIFY_EXISTING_ENDPOINT' | 'NEED_MORE_INFO' | 'REJECT_DUPLICATE' | 'HIGH_BREAKING_RISK';
  confidence: number; // 0.0 - 1.0
  compatibilityScore: number; // 0.0 - 1.0
  breakingRisk: number; // 0.0 - 1.0

  // 3 Core Dimensions:
  importanceScore?: number; // 0 - 100
  importanceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  urgencyScore?: number; // 0 - 100
  urgencyLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore?: number; // 0 - 100
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';

  priorityLevel?: 'P0' | 'P1' | 'P2' | 'P3';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  situationSummary?: string;
  triageAction?: 'DISCUSS_WEEKLY_MEETING' | 'MASTER_DIRECT_HANDLE' | 'AI_AGENT_AUTONOMOUS' | 'REJECT';
  triageAdvice?: string;
  rationale: string;
  suggestedPatch?: string;
  missingDetails?: string[];
  evaluatedAt: number;
}

export interface LineTicket {
  id: string; // e.g. TKT-1001
  source: 'line' | 'simulator';
  userId: string;
  userName: string;
  role?: 'client' | 'server' | 'pm' | 'tester';
  timestamp: number;
  message: string;
  intent: 'NEW_API' | 'MODIFY_API' | 'QUERY_API' | 'FEEDBACK';
  targetRoute?: string;
  status: TicketStatus;
  jevReview?: JevReviewResult;

  // 3 Core Dimensions:
  importanceScore?: number; // 0 - 100
  importanceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  urgencyScore?: number; // 0 - 100
  urgencyLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore?: number; // 0 - 100
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';

  priorityLevel?: 'P0' | 'P1' | 'P2' | 'P3';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  situationSummary?: string;
  triageAction?: 'DISCUSS_WEEKLY_MEETING' | 'MASTER_DIRECT_HANDLE' | 'AI_AGENT_AUTONOMOUS' | 'REJECT';
  triageAdvice?: string;
  masterNotes?: string;
  synthesizedSpecFile?: string;
}

export interface WhitelistUser {
  id: string; // LINE userId or unique identifier
  name: string;
  role: 'client' | 'server' | 'pm' | 'tester';
  allowedApis?: string[]; // for client isolation: ['/api/users']
  company?: string;
  addedAt: number;
}

export class TicketStore {
  private tickets: Map<string, LineTicket> = new Map();
  private whitelist: Map<string, WhitelistUser> = new Map();
  private ticketCounter: number = 1000;
  private storageDir: string;
  private ticketsFile: string;
  private whitelistFile: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || path.resolve(process.cwd(), '.jit');
    this.ticketsFile = path.join(this.storageDir, 'tickets.json');
    this.whitelistFile = path.join(this.storageDir, 'whitelist.json');

    this.initDefaultWhitelist();
    this.loadFromDisk();
  }

  private initDefaultWhitelist(): void {
    const defaults: WhitelistUser[] = [
      { id: 'U_DEV_LEAD', name: 'Master Engineer (Host)', role: 'server', allowedApis: ['*'], addedAt: Date.now() },
      { id: 'U_FRONTEND_ALICE', name: 'Client Alice', role: 'client', allowedApis: ['/api/users'], company: 'Partner Alice Co.', addedAt: Date.now() },
      { id: 'U_MOBILE_BOB', name: 'Client Bob', role: 'client', allowedApis: ['/api/orders'], company: 'App Bob Co.', addedAt: Date.now() },
      { id: 'U_PM_CAROL', name: 'PM Carol', role: 'pm', allowedApis: ['*'], company: 'Product Ops', addedAt: Date.now() },
    ];
    for (const u of defaults) {
      this.whitelist.set(u.id, u);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.ticketsFile)) {
        const raw = fs.readFileSync(this.ticketsFile, 'utf-8');
        const list: LineTicket[] = JSON.parse(raw);
        for (const t of list) {
          this.tickets.set(t.id, t);
          const num = parseInt(t.id.replace('TKT-', ''), 10);
          if (!isNaN(num) && num >= this.ticketCounter) {
            this.ticketCounter = num + 1;
          }
        }
      }
      if (fs.existsSync(this.whitelistFile)) {
        const raw = fs.readFileSync(this.whitelistFile, 'utf-8');
        const list: WhitelistUser[] = JSON.parse(raw);
        for (const u of list) {
          this.whitelist.set(u.id, u);
        }
      }
    } catch {
      // Fallback silently to memory
    }
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      fs.writeFileSync(this.ticketsFile, JSON.stringify(Array.from(this.tickets.values()), null, 2), 'utf-8');
      fs.writeFileSync(this.whitelistFile, JSON.stringify(Array.from(this.whitelist.values()), null, 2), 'utf-8');
    } catch {
      // Ignored in read-only / test environment
    }
  }

  // Whitelist operations
  public isWhitelisted(userId: string): boolean {
    return this.whitelist.has(userId);
  }

  public getWhitelist(): WhitelistUser[] {
    return Array.from(this.whitelist.values());
  }

  public getWhitelistUser(userId: string): WhitelistUser | undefined {
    return this.whitelist.get(userId);
  }

  public addWhitelistUser(user: WhitelistUser): WhitelistUser {
    this.whitelist.set(user.id, user);
    this.saveToDisk();
    return user;
  }

  public removeWhitelistUser(userId: string): boolean {
    const deleted = this.whitelist.delete(userId);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  // Ticket operations
  public createTicket(params: {
    source: 'line' | 'simulator';
    userId: string;
    userName: string;
    role?: 'client' | 'server' | 'pm' | 'tester';
    message: string;
    intent?: 'NEW_API' | 'MODIFY_API' | 'QUERY_API' | 'FEEDBACK';
    targetRoute?: string;
  }): LineTicket {
    const id = `TKT-${++this.ticketCounter}`;
    const ticket: LineTicket = {
      id,
      source: params.source,
      userId: params.userId,
      userName: params.userName,
      role: params.role,
      timestamp: Date.now(),
      message: params.message,
      intent: params.intent || 'MODIFY_API',
      targetRoute: params.targetRoute,
      status: 'PENDING',
    };
    this.tickets.set(id, ticket);
    this.saveToDisk();
    return ticket;
  }

  public listTickets(): LineTicket[] {
    return Array.from(this.tickets.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public getTicket(id: string): LineTicket | undefined {
    return this.tickets.get(id);
  }

  public updateTicket(id: string, updates: Partial<LineTicket>): LineTicket | undefined {
    const existing = this.tickets.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.tickets.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  public deleteTicket(id: string): boolean {
    const removed = this.tickets.delete(id);
    if (removed) this.saveToDisk();
    return removed;
  }

  public clear(): void {
    this.tickets.clear();
    this.saveToDisk();
  }
}
