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
  samplePayload?: Record<string, unknown>;
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
  levels: Record<string, string>;
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

export interface JITRequestContext {
  route: string;
  phase: LifecyclePhase;
  executionTimeMs: number;
  aiLatencyMs: number;
  intentConfidence?: number;
  isFallback?: boolean;
  engineUsed?: 'typesafe' | 'needle';
  headers?: Record<string, string | string[] | undefined>;
}

export interface JITExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  context: JITRequestContext;
}

