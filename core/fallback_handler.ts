import { SchemaObserver } from './observer.js';
import { JITRequestContext } from './types.js';
import { TypeSafeRouter } from './typesafe_router.js';

export interface FallbackOptions {
  router: TypeSafeRouter;
  observer: SchemaObserver;
  onDriftDetected?: (route: string, error: string, payload: Record<string, unknown>) => void;
}

export class FallbackHandler {
  private router: TypeSafeRouter;
  private observer: SchemaObserver;
  private onDriftDetected: (route: string, error: string, payload: Record<string, unknown>) => void;

  constructor(options: FallbackOptions) {
    this.router = options.router;
    this.observer = options.observer;
    this.onDriftDetected =
      options.onDriftDetected ||
      ((route, error) => {
        console.warn(
          `[FallbackHandler] ⚠️ Schema drift detected on '${route}': ${error}. Downgrading to Phase 1.`
        );
      });
  }

  /**
   * Execute fallback recovery: Downgrade from Phase 3 to Phase 1 & re-arm Phase 2 observation
   */
  async handleFallback(
    route: string,
    validationError: string,
    rawPayload: Record<string, unknown>
  ): Promise<{
    route: string;
    normalizedPayload: Record<string, unknown>;
    result: any;
    context: JITRequestContext;
  }> {
    // 1. Notify drift
    this.onDriftDetected(route, validationError, rawPayload);

    // 2. Reset observer for this route so it can begin Phase 2 observation for v2
    this.observer.resetRoute(route);

    // 3. Reroute through Phase 1 TypeSafe dynamic engine
    const res = await this.router.handle(rawPayload, route);

    // 4. Mark context as fallback
    res.context.isFallback = true;

    // 5. Feed this drifted payload into observer as sample 1 of v2
    await this.observer.observe(route, res.normalizedPayload, res.context.intentConfidence ?? 1.0);

    return res;
  }
}
