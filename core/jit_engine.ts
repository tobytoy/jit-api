import { z, ZodObject, ZodRawShape } from 'zod';
import { CodegenEngine, CodegenResult } from '../compiler/codegen_engine.js';
import { FallbackHandler } from './fallback_handler.js';
import { NeedleClient, NeedleClientConfig } from './needle_client.js';
import { SchemaObserver } from './observer.js';
import { SchemaStore } from './schema_store.js';
import {
  DriftMode,
  IRField,
  IRSchema,
  JITExecutionResult,
  JITRequestContext,
  LifecyclePhase,
  RouteDefinition,
  SchemaSnapshot,
} from './types.js';
import { TypeSafeClient } from './typesafe_client.js';
import { TypeSafeRouter } from './typesafe_router.js';
import {
  TrafficLightManager,
  RouteTrafficLight,
  RouteLockInfo,
  LockAcquireOptions,
} from './coordination.js';
import { UpstreamClient } from './upstream_client.js';
import { RateLimiter } from './rate_limiter.js';
import { TenantStore } from './tenant_store.js';
import { UnauthorizedError } from './types.js';

export interface JITEngineOptions {
  client?: TypeSafeClient;
  needleClient?: NeedleClient;
  needleOptions?: NeedleClientConfig;
  fallbackToNeedleOnNoKey?: boolean;
  forceNeedle?: boolean;
  stabilityThreshold?: number; // default 5
  confidenceThreshold?: number; // default 0.85
  driftMode?: DriftMode; // default 'evolve'
  persistence?: boolean | { filePath?: string }; // default false
  codegenOutputDir?: string;
  upstreamClient?: UpstreamClient;
  rateLimiter?: RateLimiter;
  tenantStore?: TenantStore;
  onFreeze?: (result: CodegenResult) => void;
  onDrift?: (route: string, error: string) => void;
}

export class JITEngine {
  private router: TypeSafeRouter;
  private observer: SchemaObserver;
  private codegen: CodegenEngine;
  private fallback: FallbackHandler;
  private driftMode: DriftMode;
  private schemaStore?: SchemaStore;
  private trafficLight: TrafficLightManager;
  private recentDrifts: Map<string, number> = new Map();
  private upstreamClient: UpstreamClient;
  private rateLimiter: RateLimiter;
  private tenantStore?: TenantStore;

  // Multi-version fast-path validator storage: route -> version -> validator
  private fastPathValidators: Map<
    string,
    Map<number, (data: unknown) => { success: boolean; data?: any; error?: string }>
  > = new Map();

  constructor(options?: JITEngineOptions) {
    const client = options?.client || new TypeSafeClient();
    this.driftMode = options?.driftMode || 'evolve';

    this.upstreamClient = options?.upstreamClient || new UpstreamClient();
    this.rateLimiter = options?.rateLimiter || new RateLimiter();
    this.tenantStore = options?.tenantStore || new TenantStore();

    this.router = new TypeSafeRouter({
      client,
      needleClient: options?.needleClient,
      needleOptions: options?.needleOptions,
      fallbackToNeedleOnNoKey: options?.fallbackToNeedleOnNoKey,
      forceNeedle: options?.forceNeedle,
      upstreamClient: this.upstreamClient,
      rateLimiter: this.rateLimiter,
      tenantStore: this.tenantStore,
    });
    this.codegen = new CodegenEngine(options?.codegenOutputDir);

    this.trafficLight = new TrafficLightManager();

    this.observer = new SchemaObserver({
      stabilityThreshold: options?.stabilityThreshold ?? 5,
      confidenceThreshold: options?.confidenceThreshold ?? 0.85,
      onFreeze: async (schema: IRSchema) => {
        // Clear recent drift flag on freeze
        this.recentDrifts.delete(schema.route);

        // Compile to TS, Go, Python, IR
        const codegenResult = this.codegen.compile(schema);

        // Build active in-memory Zod validator for Phase 3 fast-path
        this.mountFastPathValidator(schema);

        // Auto-save snapshot if persistence is enabled
        if (this.schemaStore) {
          this.schemaStore.save(this.observer.exportSnapshots());
        }

        if (options?.onFreeze) {
          options.onFreeze(codegenResult);
        }
      },
    });

    this.fallback = new FallbackHandler({
      router: this.router,
      observer: this.observer,
      onDriftDetected: (route, error) => {
        // Record drift timestamp to transition light to YELLOW
        this.recentDrifts.set(route, Date.now());

        if (options?.onDrift) {
          options.onDrift(route, error);
        }
      },
    });

    // Initialize Schema Persistence if enabled
    if (options?.persistence) {
      const storeOptions = typeof options.persistence === 'object' ? options.persistence : {};
      this.schemaStore = new SchemaStore(storeOptions);
      this.loadSnapshotsFromDisk();
    }
  }

  /**
   * Load snapshot from disk and restore Phase 3 fast-path state
   */
  public loadSnapshotsFromDisk(): boolean {
    if (!this.schemaStore) return false;
    const snapshot = this.schemaStore.load();
    if (!snapshot) return false;

    this.observer.importSnapshots(snapshot);

    // Mount validators for all restored schemas across all routes and versions
    for (const [route, schemas] of Object.entries(snapshot.schemas)) {
      for (const s of schemas) {
        this.mountFastPathValidator(s);
      }
    }

    return true;
  }

  /**
   * Register a route handler with natural intent description
   */
  public register(routeDef: RouteDefinition): this {
    this.router.register(routeDef);
    return this;
  }

  /**
   * Mount in-memory Zod validator from IRSchema for 0-latency Phase 3 execution (supports multi-version)
   */
  public mountFastPathValidator(schema: IRSchema): void {
    const shape: ZodRawShape = {};

    for (const [name, field] of Object.entries(schema.fields)) {
      let zType: z.ZodTypeAny;

      switch (field.type) {
        case 'number':
          zType = z.number();
          break;
        case 'boolean':
          zType = z.boolean();
          break;
        case 'array':
          let itemZod: z.ZodTypeAny = z.string();
          if (field.itemType === 'number') itemZod = z.number();
          else if (field.itemType === 'boolean') itemZod = z.boolean();
          else if (field.itemType === 'object') itemZod = z.record(z.unknown());
          zType = z.array(itemZod);
          break;
        case 'object':
          zType = z.record(z.unknown());
          break;
        case 'enum':
          if (field.enumValues && field.enumValues.length > 0) {
            zType = z.enum(field.enumValues as [string, ...string[]]);
          } else {
            zType = z.string();
          }
          break;
        case 'string':
        default:
          zType = z.string();
          break;
      }

      if (!field.required) {
        zType = zType.optional();
      }

      shape[name] = zType;
    }

    // In evolve mode, use passthrough so unexpected keys are preserved for handler & evolution
    const zodSchema = z.object(shape).passthrough();

    let verMap = this.fastPathValidators.get(schema.route);
    if (!verMap) {
      verMap = new Map();
      this.fastPathValidators.set(schema.route, verMap);
    }

    verMap.set(schema.version, (data: unknown) => {
      const parsed = zodSchema.safeParse(data);
      if (parsed.success) {
        return { success: true, data: parsed.data };
      }
      return {
        success: false,
        error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      };
    });
  }

  /**
   * Main dispatch entrypoint: dynamically routes, observes, or fast-paths the request
   */
  public async execute(
    payload: Record<string, unknown>,
    explicitRoute?: string,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<JITExecutionResult> {
    const startTime = Date.now();
    const targetRoute =
      explicitRoute || (typeof payload.route === 'string' ? (payload.route as string) : undefined);

    // Check if target route has active fast-path validators
    const hasFastPath = targetRoute && (this.fastPathValidators.get(targetRoute)?.size ?? 0) > 0;

    if (hasFastPath && targetRoute) {
      const verMap = this.fastPathValidators.get(targetRoute);
      const routeDef = this.router.getRoute(targetRoute);

      if (verMap && verMap.size > 0 && routeDef) {
        // Enforce route authentication in Phase 3
        TypeSafeRouter.validateAuth(routeDef, headers);

        // Sort versions descending (v2, v1, ...) to test newest first
        const sortedVersions = Array.from(verMap.entries()).sort((a, b) => b[0] - a[0]);

        let matchedValidation: { success: boolean; data?: any; error?: string } | null = null;
        let matchedVersion: number | null = null;
        let matchedSchema: IRSchema | undefined;

        for (const [ver, validator] of sortedVersions) {
          const validation = validator(payload);
          if (validation.success) {
            matchedValidation = validation;
            matchedVersion = ver;
            matchedSchema = this.observer.getFrozenSchema(targetRoute, ver);
            break;
          }
        }

        if (matchedValidation && matchedValidation.success && matchedVersion !== null) {
          // Check for unexpected extra keys (Diff Watcher)
          const expectedKeys = matchedSchema ? Object.keys(matchedSchema.fields) : [];
          const payloadKeys = Object.keys(payload);
          const hasExtraKeys = payloadKeys.some((k) => !expectedKeys.includes(k) && k !== 'route');

          if (hasExtraKeys && this.driftMode === 'strict') {
            // Strict mode: extra keys trigger immediate hard drift
            const fallbackRes = await this.fallback.handleFallback(
              targetRoute,
              `Strict drift check: unexpected field(s) in payload: ${payloadKeys
                .filter((k) => !expectedKeys.includes(k))
                .join(', ')}`,
              payload,
              headers
            );
            return {
              success: true,
              data: fallbackRes.result,
              context: fallbackRes.context,
            };
          }

          // Fast-path execution (0ms AI latency)
          const ctx: JITRequestContext = {
            route: targetRoute,
            phase: 'phase3_frozen',
            version: matchedVersion,
            executionTimeMs: Date.now() - startTime,
            aiLatencyMs: 0,
            intentConfidence: 1.0,
            isFallback: false,
            softDriftDetected: hasExtraKeys,
            headers,
            upstreamFetch: (url, opts) => this.upstreamClient.fetch(url, opts).then((r) => r.data),
          };

          if (this.tenantStore) {
            const apiKey = this.extractApiKey(headers);
            if (apiKey) {
              const tenant = this.tenantStore.getTenantByApiKey(apiKey);
              if (tenant) {
                ctx.tenant = tenant;
                if (!this.tenantStore.isRouteAllowed(tenant, targetRoute)) {
                  throw new UnauthorizedError(`Forbidden: 您的帳號 (${tenant.name}) 無權存取端點 '${targetRoute}'`);
                }
                if (tenant.rateLimit) {
                  const check = this.rateLimiter.checkLimit(`tenant:${tenant.id}`, tenant.rateLimit);
                  if (!check.allowed) {
                    throw new Error(`[HTTP 429 Too Many Requests] ${check.error}`);
                  }
                }
              }
            }
          }

          if (routeDef.rateLimit) {
            const ipOrId = (headers?.['x-forwarded-for'] as string) || (headers?.['x-real-ip'] as string) || 'client_direct';
            const check = this.rateLimiter.checkLimit(`${targetRoute}:${ipOrId}`, routeDef.rateLimit);
            if (!check.allowed) {
              throw new Error(`[HTTP 429 Too Many Requests] ${check.error}`);
            }
          }

          const data = await routeDef.handler(matchedValidation.data, ctx);

          // In evolve mode, if extra keys were detected, observe smooth evolution in background
          if (hasExtraKeys && this.driftMode === 'evolve') {
            // Non-blocking smooth evolution
            this.observer.observeEvolution(targetRoute, payload, data).catch(() => {});
          }

          return {
            success: true,
            data,
            context: ctx,
          };
        } else if (this.observer.isFrozen(targetRoute)) {
          // Schema drift detected! Failed all frozen versions while route is supposed to be frozen.
          // Trigger FallbackHandler: downgrade back to Phase 1, auto-repair, and start observation for vNext
          const latestError = 'Static validation failed across all registered schema versions';
          const fallbackRes = await this.fallback.handleFallback(
            targetRoute,
            latestError,
            payload,
            headers
          );

          return {
            success: true,
            data: fallbackRes.result,
            context: fallbackRes.context,
          };
        }
      }
    }

    // Phase 1: Dynamic Semantic Routing via TypeSafe Jev (validates auth after route matching)
    const res = await this.router.handle(payload, targetRoute, headers);

    // Phase 2: Observation & Stability tracking (Bidirectional: Request + Response)
    const obs = await this.observer.observe(
      res.route,
      res.normalizedPayload,
      res.result,
      res.context.intentConfidence ?? 1.0
    );

    const phase: LifecyclePhase = obs.stable ? 'phase3_frozen' : 'phase1_dynamic';
    res.context.phase = phase;
    if (obs.frozenSchema) {
      res.context.version = obs.frozenSchema.version;
    }

    return {
      success: true,
      data: res.result,
      context: res.context,
    };
  }

  /**
   * Inspect status of a route (including real-time Traffic Light and Coordination state)
   */
  public getRouteStatus(route: string): {
    route: string;
    isFrozen: boolean;
    metrics: ReturnType<SchemaObserver['getMetrics']>;
    frozenSchema?: IRSchema;
    frozenSchemas: IRSchema[];
    trafficLight: RouteTrafficLight;
  } {
    const isFrozen = this.observer.isFrozen(route);
    const metrics = this.observer.getMetrics(route);
    const lastDrift = this.recentDrifts.get(route);
    const hasRecentDrift = lastDrift !== undefined && Date.now() - lastDrift < 45000;
    const trafficLight = this.trafficLight.evaluateLight(route, isFrozen, metrics, hasRecentDrift);

    return {
      route,
      isFrozen,
      metrics,
      frozenSchema: this.observer.getFrozenSchema(route),
      frozenSchemas: this.observer.getFrozenSchemas(route),
      trafficLight,
    };
  }

  public getTrafficLightManager(): TrafficLightManager {
    return this.trafficLight;
  }

  public acquireLock(options: LockAcquireOptions) {
    return this.trafficLight.acquireLock(options);
  }

  public releaseLock(route: string, role?: 'client' | 'server' | 'system' | 'force') {
    return this.trafficLight.releaseLock(route, role);
  }

  public getRouter(): TypeSafeRouter {
    return this.router;
  }

  public getRoutes(): RouteDefinition[] {
    return this.router.getRoutes();
  }

  public getObserver(): SchemaObserver {
    return this.observer;
  }

  public exportSnapshots(): SchemaSnapshot {
    return this.observer.exportSnapshots();
  }

  public importSnapshots(snapshot: SchemaSnapshot): void {
    this.observer.importSnapshots(snapshot);
    for (const schemas of Object.values(snapshot.schemas)) {
      for (const s of schemas) {
        this.mountFastPathValidator(s);
      }
    }
  }

  public getSchemaStore(): SchemaStore | undefined {
    return this.schemaStore;
  }

  public getUpstreamClient(): UpstreamClient {
    return this.upstreamClient;
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getTenantStore(): TenantStore | undefined {
    return this.tenantStore;
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
