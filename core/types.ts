/**
 * JIT Protocol Synthesis Framework - Core Types
 */

export type LifecyclePhase = 'phase1_dynamic' | 'phase2_observing' | 'phase3_frozen';

export type IRFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';

export interface IRField {
  name: string;
  type: IRFieldType;
  required: boolean;
  enumValues?: string[];
  description?: string;
  itemType?: IRFieldType;
  properties?: Record<string, IRField>;
}

export interface IRSchema {
  name: string;
  version: number;
  route: string;
  description?: string;
  fields: Record<string, IRField>;
  responseFields?: Record<string, IRField>;
  samplePayload?: Record<string, unknown>;
  sampleResponse?: Record<string, unknown>;
  frozenAt?: string;
}


export interface JevChoiceQuestion {
  type: 'choice';
  criteria: Record<string, string>;
}

export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
}

export interface JevScoreQuestion {
  type: 'score';
  criteria?: string[] | Record<string, string>;
  levels?: Record<string, string>;
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion | JevScoreQuestion;

export interface JevRequest {
  model?: string;
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
}

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

export interface JevScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AuthDefinition {
  type: 'none' | 'bearer' | 'api-key';
  header?: string;
  token?: string;
  envVar?: string;
}

export class UnauthorizedError extends Error {
  public statusCode: number = 401;
  constructor(message: string = 'Unauthorized: invalid or missing authentication credentials') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface RouteDefinition {
  route: string;
  description: string;
  intentCriteria: string;
  version?: string;
  stage?: 'dev' | 'prod';
  auth?: AuthDefinition;
  upstream?: UpstreamDefinition;
  rateLimit?: RateLimitDefinition;
  samplePayload?: Record<string, any>;
  sampleSemantic?: string;
  enumFields?: Record<string, Record<string, string>>;
  handler: (payload: any, ctx: JITRequestContext) => Promise<any>;
}

export interface StabilityMetrics {
  sampleCount: number;
  consecutiveMatches: number;
  requiredThreshold: number;
  confidenceThreshold: number;
  avgConfidence: number;
  isStable: boolean;
}

export type DriftMode = 'evolve' | 'strict' | 'lenient';

export interface AutoRepairModification {
  field: string;
  type: 'rename' | 'coerce' | 'alias';
  from: unknown;
  to: unknown;
  reason: string;
}

export interface AutoRepairResult {
  repaired: boolean;
  payload: Record<string, unknown>;
  modifications: AutoRepairModification[];
}

export interface SchemaSnapshot {
  exportedAt: string;
  version: string;
  schemas: Record<string, IRSchema[]>;
}

export interface UpstreamDefinition {
  targetUrl: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  secretRef?: string;
  cacheTtlSeconds?: number;
  timeoutMs?: number;
}

export interface RateLimitDefinition {
  windowSeconds: number;
  maxRequests: number;
  dailyQuota?: number;
}

export type UserRole = 'master' | 'dev' | 'pm' | 'client' | 'guest';

export interface TenantDefinition {
  id: string;
  name: string;
  role: UserRole;
  apiKey: string;
  allowedRoutes: string[]; // ['*'] or specific routes
  rateLimit?: RateLimitDefinition;
  lineUserId?: string;
  company?: string;
  createdAt: string;
}

export interface MasterAuthSession {
  token: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
  role?: UserRole;
}

export interface MasterAuthStatus {
  enabled: boolean;
  authenticated: boolean;
  role: 'master' | 'guest';
  spaceEnvironment: boolean;
  requiresLogin: boolean;
}

export interface JevImportanceEvaluation {
  // 3 Core Dimensions requested by User:
  importanceScore: number; // 0 - 100
  importanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  urgencyScore: number; // 0 - 100
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskScore: number; // 0 - 100
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';

  // Synthesis & Recommendation:
  score: number; // Overall priority score 0 - 100
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  businessImpact: 'production_outage' | 'client_integration' | 'internal_enhancement' | 'routine_maintenance';
  technicalRisk: 'critical_breaking' | 'schema_conflict' | 'additive_safe' | 'zero_risk';
  situationSummary: string;
  triageAction: 'DISCUSS_WEEKLY_MEETING' | 'MASTER_DIRECT_HANDLE' | 'AI_AGENT_AUTONOMOUS' | 'REJECT';
  triageAdvice: string;
  confidence: number;
}

export interface JITRequestContext {
  route: string;
  phase: LifecyclePhase;
  executionTimeMs: number;
  aiLatencyMs: number;
  version?: number;
  intentConfidence?: number;
  isFallback?: boolean;
  autoRepaired?: boolean;
  repairDetails?: string[];
  softDriftDetected?: boolean;
  engineUsed?: 'typesafe' | 'needle';
  headers?: Record<string, string | string[] | undefined>;
  tenant?: TenantDefinition;
  upstreamFetch?: <T = any>(targetUrl: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    secretRef?: string;
    cacheTtlSeconds?: number;
    timeoutMs?: number;
  }) => Promise<T>;
}

export interface JITExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  context: JITRequestContext;
}


