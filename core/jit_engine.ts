import { z, ZodObject, ZodRawShape } from 'zod';
import { CodegenEngine, CodegenResult } from '../compiler/codegen_engine.js';
import { FallbackHandler } from './fallback_handler.js';
import { NeedleClient, NeedleClientConfig } from './needle_client.js';
import { SchemaObserver } from './observer.js';
import {
  IRField,
  IRSchema,
  JITExecutionResult,
  JITRequestContext,
  LifecyclePhase,
  RouteDefinition,
} from './types.js';
import { TypeSafeClient } from './typesafe_client.js';
import { TypeSafeRouter } from './typesafe_router.js';

export interface JITEngineOptions {
  client?: TypeSafeClient;
  needleClient?: NeedleClient;
  needleOptions?: NeedleClientConfig;
  fallbackToNeedleOnNoKey?: boolean;
  forceNeedle?: boolean;
  stabilityThreshold?: number; // default 5
  confidenceThreshold?: number; // default 0.85
  codegenOutputDir?: string;
  onFreeze?: (result: CodegenResult) => void;
  onDrift?: (route: string, error: string) => void;
}

export class JITEngine {
  private router: TypeSafeRouter;
  private observer: SchemaObserver;
  private codegen: CodegenEngine;
  private fallback: FallbackHandler;
  private fastPathValidators: Map<
    string,
    (data: unknown) => { success: boolean; data?: any; error?: string }
  > = new Map();

  constructor(options?: JITEngineOptions) {
    const client = options?.client || new TypeSafeClient();
    this.router = new TypeSafeRouter({
      client,
      needleClient: options?.needleClient,
      needleOptions: options?.needleOptions,
      fallbackToNeedleOnNoKey: options?.fallbackToNeedleOnNoKey,
      forceNeedle: options?.forceNeedle,
    });
    this.codegen = new CodegenEngine(options?.codegenOutputDir);

    this.observer = new SchemaObserver({
      stabilityThreshold: options?.stabilityThreshold ?? 5,
      confidenceThreshold: options?.confidenceThreshold ?? 0.85,
      onFreeze: async (schema: IRSchema) => {
        // Compile to TS, Go, Python, IR
        const codegenResult = this.codegen.compile(schema);

        // Build active in-memory Zod validator for Phase 3 fast-path
        this.mountFastPathValidator(schema);

        if (options?.onFreeze) {
          options.onFreeze(codegenResult);
        }
      },
    });

    this.fallback = new FallbackHandler({
      router: this.router,
      observer: this.observer,
      onDriftDetected: (route, error) => {
        // Remove fast path validator to re-enter dynamic mode
        this.fastPathValidators.delete(route);
        if (options?.onDrift) {
          options.onDrift(route, error);
        }
      },
    });
  }

  /**
   * Register a route handler with natural intent description
   */
  public register(routeDef: RouteDefinition): this {
    this.router.register(routeDef);
    return this;
  }

  /**
   * Mount in-memory Zod validator from IRSchema for 0-latency Phase 3 execution
   */
  private mountFastPathValidator(schema: IRSchema): void {
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

    const zodSchema = z.object(shape);

    this.fastPathValidators.set(schema.route, (data: unknown) => {
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
    explicitRoute?: string
  ): Promise<JITExecutionResult> {
    const startTime = Date.now();
    const targetRoute =
      explicitRoute || (typeof payload.route === 'string' ? (payload.route as string) : undefined);

    // Check if target route is already frozen in Phase 3
    const isTargetFrozen = targetRoute && this.observer.isFrozen(targetRoute);

    if (isTargetFrozen && targetRoute) {
      const validator = this.fastPathValidators.get(targetRoute);
      const routeDef = this.router.getRoute(targetRoute);

      if (validator && routeDef) {
        // Run static fast-path validation (0ms AI latency)
        const validation = validator(payload);

        if (validation.success) {
          // Fast-path execution
          const ctx: JITRequestContext = {
            route: targetRoute,
            phase: 'phase3_frozen',
            executionTimeMs: Date.now() - startTime,
            aiLatencyMs: 0, // 0 AI latency!
            intentConfidence: 1.0,
            isFallback: false,
          };

          const data = await routeDef.handler(validation.data, ctx);
          return {
            success: true,
            data,
            context: ctx,
          };
        } else {
          // Schema drift detected! Validation failed on frozen route.
          // Trigger FallbackHandler: downgrade back to Phase 1 and start v2 observation
          const fallbackRes = await this.fallback.handleFallback(
            targetRoute,
            validation.error || 'Static validation failed',
            payload
          );

          return {
            success: true,
            data: fallbackRes.result,
            context: fallbackRes.context,
          };
        }
      }
    }

    // Phase 1: Dynamic Semantic Routing via TypeSafe Jev
    const res = await this.router.handle(payload, targetRoute);

    // Phase 2: Observation & Stability tracking
    const obs = await this.observer.observe(
      res.route,
      res.normalizedPayload,
      res.context.intentConfidence ?? 1.0
    );

    const phase: LifecyclePhase = obs.stable ? 'phase3_frozen' : 'phase1_dynamic';
    res.context.phase = phase;

    return {
      success: true,
      data: res.result,
      context: res.context,
    };
  }

  /**
   * Inspect status of a route
   */
  public getRouteStatus(route: string): {
    route: string;
    isFrozen: boolean;
    metrics: ReturnType<SchemaObserver['getMetrics']>;
    frozenSchema?: IRSchema;
  } {
    return {
      route,
      isFrozen: this.observer.isFrozen(route),
      metrics: this.observer.getMetrics(route),
      frozenSchema: this.observer.getFrozenSchema(route),
    };
  }

  public getRouter(): TypeSafeRouter {
    return this.router;
  }

  public getObserver(): SchemaObserver {
    return this.observer;
  }
}
