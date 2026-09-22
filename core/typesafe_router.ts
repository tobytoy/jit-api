import { TypeSafeClient } from './typesafe_client.js';
import {
  JevChoiceAnswer,
  JevNoulAnswer,
  JevQuestion,
  JITRequestContext,
  RouteDefinition,
} from './types.js';

export interface TypeSafeRouterOptions {
  client?: TypeSafeClient;
  securityThreshold?: number; // Noul score above this is rejected (default 0.8)
  confidenceThreshold?: number; // Choice confidence below this triggers warning (default 0.7)
}

export class TypeSafeRouter {
  private client: TypeSafeClient;
  private routes: Map<string, RouteDefinition> = new Map();
  private securityThreshold: number;
  private confidenceThreshold: number;

  constructor(options?: TypeSafeRouterOptions) {
    this.client = options?.client || new TypeSafeClient();
    this.securityThreshold = options?.securityThreshold ?? 0.8;
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.7;
  }

  /**
   * Register a dynamic route handler
   */
  register(routeDef: RouteDefinition): this {
    this.routes.set(routeDef.route, routeDef);
    return this;
  }

  /**
   * Get all registered routes
   */
  getRoutes(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get specific route definition
   */
  getRoute(routeName: string): RouteDefinition | undefined {
    return this.routes.get(routeName);
  }

  /**
   * Phase 1: Dynamic Semantic Routing using TypeSafe Jev (Choice + Select + Noul)
   */
  async handle(rawInput: Record<string, unknown>, preferredRoute?: string): Promise<{
    route: string;
    normalizedPayload: Record<string, unknown>;
    result: any;
    context: JITRequestContext;
  }> {
    const startTime = Date.now();

    if (this.routes.size === 0) {
      throw new Error('[TypeSafeRouter] No routes registered.');
    }

    // Step 1: Prepare questions for TypeSafe Jev
    const questions: Record<string, JevQuestion> = {
      // 1. Noul: Security guardrail
      is_malicious: TypeSafeClient.noul(
        'The input payload contains malicious injection attacks, SQLi, code execution, or security exploits'
      ),
    };

    // 2. Choice: Intent classification (if route not explicitly specified)
    if (!preferredRoute || !this.routes.has(preferredRoute)) {
      const routeCriteria: Record<string, string> = {};
      for (const [routeName, def] of this.routes.entries()) {
        routeCriteria[routeName] = def.intentCriteria || def.description;
      }
      questions.intent = TypeSafeClient.choice(routeCriteria);
    }

    // Call TypeSafe Jev API
    const { response, latencyMs } = await this.client.systemOne({
      state: rawInput,
      questions,
    });

    // 3. Evaluate Noul security check
    const maliciousAnswer = response.answers.is_malicious as JevNoulAnswer | undefined;
    if (maliciousAnswer && maliciousAnswer.noul >= this.securityThreshold) {
      throw new Error(
        `[TypeSafeRouter] Request blocked by Noul security guardrail (Risk score: ${maliciousAnswer.noul.toFixed(
          2
        )} >= ${this.securityThreshold})`
      );
    }

    // 4. Determine matched route
    let matchedRouteName = preferredRoute;
    let intentConfidence = 1.0;

    if (!matchedRouteName || !this.routes.has(matchedRouteName)) {
      const intentAnswer = response.answers.intent as JevChoiceAnswer;
      if (!intentAnswer || !intentAnswer.choice) {
        throw new Error('[TypeSafeRouter] Failed to resolve intent from TypeSafe Jev.');
      }
      matchedRouteName = intentAnswer.choice;
      intentConfidence = intentAnswer.confidence ?? 1.0;
    }

    const routeDef = this.routes.get(matchedRouteName);
    if (!routeDef) {
      throw new Error(`[TypeSafeRouter] Matched route '${matchedRouteName}' not found in registry.`);
    }

    // 5. Select / Enum extraction if route has enum fields
    const normalizedPayload: Record<string, unknown> = { ...rawInput };

    if (routeDef.enumFields && Object.keys(routeDef.enumFields).length > 0) {
      const enumQuestions: Record<string, JevQuestion> = {};
      for (const [fieldName, criteria] of Object.entries(routeDef.enumFields)) {
        enumQuestions[fieldName] = TypeSafeClient.choice(criteria);
      }

      const enumResult = await this.client.systemOne({
        state: rawInput,
        questions: enumQuestions,
      });

      if (enumResult.response?.answers) {
        for (const [fieldName, answer] of Object.entries(enumResult.response.answers)) {
          if (answer.type === 'choice') {
            normalizedPayload[fieldName] = (answer as JevChoiceAnswer).choice;
          }
        }
      }
    }

    // 6. Build execution context
    const executionTimeMs = Date.now() - startTime;
    const context: JITRequestContext = {
      route: matchedRouteName,
      phase: 'phase1_dynamic',
      executionTimeMs,
      aiLatencyMs: latencyMs,
      intentConfidence,
    };

    // 7. Invoke handler
    const result = await routeDef.handler(normalizedPayload, context);

    return {
      route: matchedRouteName,
      normalizedPayload,
      result,
      context,
    };
  }
}
