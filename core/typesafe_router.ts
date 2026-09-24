import { NeedleClient, NeedleClientConfig } from './needle_client.js';
import { TypeSafeClient } from './typesafe_client.js';
import { UpstreamClient } from './upstream_client.js';
import { RateLimiter } from './rate_limiter.js';
import { TenantStore } from './tenant_store.js';
import {
  JITRequestContext,
  JevChoiceAnswer,
  JevNoulAnswer,
  JevQuestion,
  RouteDefinition,
  UnauthorizedError,
} from './types.js';

export interface TypeSafeRouterOptions {
  client?: TypeSafeClient;
  needleClient?: NeedleClient;
  needleOptions?: NeedleClientConfig;
  fallbackToNeedleOnNoKey?: boolean;
  forceNeedle?: boolean;
  securityThreshold?: number; // Noul score above this is rejected (default 0.8)
  confidenceThreshold?: number; // Choice confidence below this triggers warning (default 0.7)
  upstreamClient?: UpstreamClient;
  rateLimiter?: RateLimiter;
  tenantStore?: TenantStore;
}

export class TypeSafeRouter {
  private client: TypeSafeClient;
  private needleClient: NeedleClient;
  private fallbackToNeedleOnNoKey: boolean;
  private forceNeedle: boolean;
  private routes: Map<string, RouteDefinition> = new Map();
  private securityThreshold: number;
  private confidenceThreshold: number;
  private upstreamClient?: UpstreamClient;
  private rateLimiter?: RateLimiter;
  private tenantStore?: TenantStore;

  constructor(options?: TypeSafeRouterOptions) {
    this.client = options?.client || new TypeSafeClient();
    this.needleClient = options?.needleClient || new NeedleClient(options?.needleOptions);
    this.fallbackToNeedleOnNoKey = options?.fallbackToNeedleOnNoKey ?? true;
    this.forceNeedle = options?.forceNeedle ?? false;
    this.securityThreshold = options?.securityThreshold ?? 0.8;
    this.confidenceThreshold = options?.confidenceThreshold ?? 0.7;
    this.upstreamClient = options?.upstreamClient;
    this.rateLimiter = options?.rateLimiter;
    this.tenantStore = options?.tenantStore;
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
   * Validate authentication credentials against route definition
   */
  public static validateAuth(
    routeDef: RouteDefinition,
    headers?: Record<string, string | string[] | undefined>
  ): void {
    const auth = routeDef.auth;
    if (!auth || auth.type === 'none') {
      return;
    }

    const headerName = (auth.header || (auth.type === 'bearer' ? 'authorization' : 'x-api-key')).toLowerCase();

    let headerValue: string | undefined;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === headerName) {
          headerValue = Array.isArray(v) ? v[0] : v;
          break;
        }
      }
    }

    if (!headerValue) {
      throw new UnauthorizedError(
        `Authentication required: missing header '${headerName}' for route '${routeDef.route}'`
      );
    }

    const expectedToken = auth.token || (auth.envVar ? process.env[auth.envVar] : undefined);

    if (auth.type === 'bearer') {
      const match = headerValue.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        throw new UnauthorizedError(`Invalid Bearer token format in '${headerName}' header`);
      }
      const token = match[1].trim();
      if (expectedToken && token !== expectedToken) {
        throw new UnauthorizedError(`Invalid Bearer token for route '${routeDef.route}'`);
      }
    } else if (auth.type === 'api-key') {
      const key = headerValue.trim();
      if (expectedToken && key !== expectedToken) {
        throw new UnauthorizedError(`Invalid API Key for route '${routeDef.route}'`);
      }
    }
  }

  /**
   * Phase 1: Dynamic Semantic Routing using TypeSafe Jev (Choice + Select + Noul)
   */
  async handle(
    rawInput: Record<string, unknown>,
    preferredRoute?: string,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<{
    route: string;
    normalizedPayload: Record<string, unknown>;
    result: any;
    context: JITRequestContext;
  }> {
    const startTime = Date.now();

    if (this.routes.size === 0) {
      throw new Error('[TypeSafeRouter] No routes registered.');
    }

    // Step 0: Check if Needle local fallback should be activated
    const useNeedle = this.forceNeedle || (!this.client.hasApiKey() && this.fallbackToNeedleOnNoKey);

    if (useNeedle) {
      const allRoutes = Array.from(this.routes.values());
      const needleRes = await this.needleClient.handle(rawInput, allRoutes, preferredRoute);

      const routeDef = this.routes.get(needleRes.route);
      if (!routeDef) {
        throw new Error(`[TypeSafeRouter] Matched route '${needleRes.route}' not found in registry.`);
      }

      const executionTimeMs = Date.now() - startTime;
      const context: JITRequestContext = {
        route: needleRes.route,
        phase: 'phase1_dynamic',
        executionTimeMs,
        aiLatencyMs: needleRes.latencyMs,
        intentConfidence: needleRes.confidence,
        engineUsed: 'needle',
        headers,
      };

      // Validate authentication before handler execution
      TypeSafeRouter.validateAuth(routeDef, headers);
      this.enrichContextAndCheckLimits(context, routeDef, headers);

      const result = await routeDef.handler(needleRes.normalizedPayload, context);

      return {
        route: needleRes.route,
        normalizedPayload: needleRes.normalizedPayload,
        result,
        context,
      };
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
      engineUsed: 'typesafe',
      headers,
    };

    // 7. Validate authentication before handler execution
    TypeSafeRouter.validateAuth(routeDef, headers);
    this.enrichContextAndCheckLimits(context, routeDef, headers);

    // 8. Invoke handler
    const result = await routeDef.handler(normalizedPayload, context);

    return {
      route: matchedRouteName,
      normalizedPayload,
      result,
      context,
    };
  }

  private enrichContextAndCheckLimits(
    context: JITRequestContext,
    routeDef: RouteDefinition,
    headers?: Record<string, string | string[] | undefined>
  ): void {
    if (this.upstreamClient) {
      context.upstreamFetch = (url, opts) => this.upstreamClient!.fetch(url, opts).then((r) => r.data);
    }

    if (this.tenantStore) {
      const apiKey = this.extractApiKey(headers);
      if (apiKey) {
        const tenant = this.tenantStore.getTenantByApiKey(apiKey);
        if (tenant) {
          context.tenant = tenant;
          if (!this.tenantStore.isRouteAllowed(tenant, routeDef.route)) {
            throw new UnauthorizedError(`Forbidden: 您的帳號 (${tenant.name}) 無權存取端點 '${routeDef.route}'`);
          }
          if (this.rateLimiter && tenant.rateLimit) {
            const check = this.rateLimiter.checkLimit(`tenant:${tenant.id}`, tenant.rateLimit);
            if (!check.allowed) {
              throw new Error(`[HTTP 429 Too Many Requests] ${check.error}`);
            }
          }
        }
      }
    }

    if (this.rateLimiter && routeDef.rateLimit) {
      const ipOrId = (headers?.['x-forwarded-for'] as string) || (headers?.['x-real-ip'] as string) || 'client_direct';
      const check = this.rateLimiter.checkLimit(`${routeDef.route}:${ipOrId}`, routeDef.rateLimit);
      if (!check.allowed) {
        throw new Error(`[HTTP 429 Too Many Requests] ${check.error}`);
      }
    }
  }

  private extractApiKey(headers?: Record<string, string | string[] | undefined>): string {
    if (!headers) return '';
    const authHeader = headers['authorization'] || headers['Authorization'];
    const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (authStr && authStr.startsWith('Bearer ')) {
      return authStr.substring(7).trim();
    }
    const keyHeader = headers['x-api-key'] || headers['X-API-KEY'] || headers['x-apikey'];
    const keyStr = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
    if (keyStr) return keyStr.trim();
    return '';
  }
}
