import { JITRequestContext, RouteDefinition } from './types.js';

export interface NeedleClientConfig {
  serverUrl?: string;
  timeoutMs?: number;
  enableLocalGuardrail?: boolean;
}

export interface NeedleToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NeedleResponse {
  type: 'call' | 'respond';
  function_calls: NeedleToolCall[];
  confidence: number;
  reasoning?: string;
}

export class NeedleClient {
  private serverUrl: string;
  private timeoutMs: number;
  private enableLocalGuardrail: boolean;

  constructor(config?: NeedleClientConfig) {
    this.serverUrl = config?.serverUrl || process.env.NEEDLE_SERVER_URL || 'http://127.0.0.1:8000';
    this.timeoutMs = config?.timeoutMs || 5000;
    this.enableLocalGuardrail = config?.enableLocalGuardrail ?? true;
  }

  /**
   * Convert RouteDefinition into Needle's standard tool schema
   */
  public routeToNeedleTool(routeDef: RouteDefinition): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    if (routeDef.enumFields) {
      for (const [fieldName, criteria] of Object.entries(routeDef.enumFields)) {
        properties[fieldName] = {
          type: 'string',
          enum: Object.keys(criteria),
          description: `Allowed values: ${Object.entries(criteria)
            .map(([k, v]) => `${k} (${v})`)
            .join(', ')}`,
        };
      }
    }

    return {
      name: routeDef.route,
      description: `${routeDef.description}. Intent criteria: ${routeDef.intentCriteria}`,
      parameters: {
        type: 'object',
        properties,
      },
    };
  }

  /**
   * Local security guardrail (simulating Noul exploit filtering offline)
   */
  private checkSecurityGuardrail(payload: Record<string, unknown>): void {
    if (!this.enableLocalGuardrail) return;

    const dangerousPatterns = [
      /('|;|--|\/\*|\b(DROP\s+TABLE|UNION\s+SELECT|ALTER\s+TABLE|EXEC\s*\()\b)/i,
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
      /\b(rm\s+-rf|chmod\s+777|wget\s+http|curl\s+http)/i,
    ];

    const stringified = JSON.stringify(payload);
    for (const pattern of dangerousPatterns) {
      if (pattern.test(stringified)) {
        throw new Error(
          `[NeedleClient] Request blocked by local security guardrail (Matched exploit pattern)`
        );
      }
    }
  }

  /**
   * Execute semantic decision via local Needle HTTP server or embedded fallback
   */
  public async handle(
    rawInput: Record<string, unknown>,
    routes: RouteDefinition[],
    preferredRoute?: string
  ): Promise<{
    route: string;
    normalizedPayload: Record<string, unknown>;
    confidence: number;
    latencyMs: number;
    reasoning?: string;
  }> {
    const startTime = Date.now();

    // 1. Local Guardrail Check
    this.checkSecurityGuardrail(rawInput);

    // If preferredRoute is already specified, bypass intent resolution
    if (preferredRoute && routes.some((r) => r.route === preferredRoute)) {
      return {
        route: preferredRoute,
        normalizedPayload: { ...rawInput },
        confidence: 1.0,
        latencyMs: Date.now() - startTime,
      };
    }

    // 2. Prepare Needle Tools
    const tools = routes.map((r) => this.routeToNeedleTool(r));
    const query =
      typeof rawInput.message === 'string'
        ? rawInput.message
        : typeof rawInput.text === 'string'
        ? rawInput.text
        : JSON.stringify(rawInput);

    // 3. Try calling Needle local server
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.serverUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          payload: rawInput,
          tools,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as NeedleResponse;
        if (data.function_calls && data.function_calls.length > 0) {
          const call = data.function_calls[0];
          return {
            route: call.name,
            normalizedPayload: { ...rawInput, ...call.arguments },
            confidence: data.confidence ?? 0.95,
            latencyMs: Date.now() - startTime,
            reasoning: data.reasoning,
          };
        }
      }
    } catch {
      // Needle server offline or unreachable; proceed to embedded deterministic semantic matcher
    }

    // 4. Embedded Semantic Matcher Fallback (Offline Mode)
    return this.embeddedSemanticMatch(query, rawInput, routes, startTime);
  }

  /**
   * Embedded fallback matcher when Needle server is not running
   */
  private embeddedSemanticMatch(
    query: string,
    rawInput: Record<string, unknown>,
    routes: RouteDefinition[],
    startTime: number
  ): {
    route: string;
    normalizedPayload: Record<string, unknown>;
    confidence: number;
    latencyMs: number;
    reasoning: string;
  } {
    const qLower = query.toLowerCase();
    let bestRoute = routes[0];
    let highestScore = -1;

    for (const route of routes) {
      let score = 0;
      const keywords = `${route.route} ${route.description} ${route.intentCriteria}`
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2);

      for (const kw of keywords) {
        if (qLower.includes(kw)) {
          score += 1;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestRoute = route;
      }
    }

    const normalizedPayload: Record<string, unknown> = { ...rawInput };

    // Extract enums if defined
    if (bestRoute.enumFields) {
      for (const [field, options] of Object.entries(bestRoute.enumFields)) {
        if (!normalizedPayload[field]) {
          for (const optKey of Object.keys(options)) {
            if (qLower.includes(optKey.toLowerCase())) {
              normalizedPayload[field] = optKey;
              break;
            }
          }
        }
      }
    }

    const confidence = highestScore > 0 ? 0.92 : 0.85;

    return {
      route: bestRoute.route,
      normalizedPayload,
      confidence,
      latencyMs: Date.now() - startTime,
      reasoning: `Matched route '${bestRoute.route}' with keyword overlap score ${highestScore}`,
    };
  }
}
