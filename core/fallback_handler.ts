import { AutoRepairer } from './auto_repair.js';
import { SchemaObserver } from './observer.js';
import { JITRequestContext } from './types.js';
import { TypeSafeRouter } from './typesafe_router.js';

export interface FallbackOptions {
  router: TypeSafeRouter;
  observer: SchemaObserver;
  autoRepairer?: AutoRepairer;
  onDriftDetected?: (route: string, error: string, payload: Record<string, unknown>) => void;
}

export class FallbackHandler {
  private router: TypeSafeRouter;
  private observer: SchemaObserver;
  private autoRepairer: AutoRepairer;
  private onDriftDetected: (route: string, error: string, payload: Record<string, unknown>) => void;

  constructor(options: FallbackOptions) {
    this.router = options.router;
    this.observer = options.observer;
    this.autoRepairer = options.autoRepairer || new AutoRepairer();
    this.onDriftDetected =
      options.onDriftDetected ||
      ((route, error) => {
        console.warn(
          `[FallbackHandler] ⚠️ Schema drift detected on '${route}': ${error}. Downgrading to Phase 1.`
        );
      });
  }

  /**
   * Execute fallback recovery: Downgrade from Phase 3 to Phase 1, Auto-Repair drifted payload, & re-arm Phase 2 observation
   */
  async handleFallback(
    route: string,
    validationError: string,
    rawPayload: Record<string, unknown>,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<{
    route: string;
    normalizedPayload: Record<string, unknown>;
    result: any;
    context: JITRequestContext;
  }> {
    // 1. Notify drift
    this.onDriftDetected(route, validationError, rawPayload);

    // 2. Fetch last known schema to guide auto-repair
    const lastSchema = this.observer.getFrozenSchema(route);
    const repairResult = this.autoRepairer.repair(rawPayload, lastSchema?.fields);
    const effectivePayload = repairResult.repaired ? repairResult.payload : rawPayload;

    if (repairResult.repaired) {
      console.log(
        `[FallbackHandler] 🛠️ Auto-repaired ${repairResult.modifications.length} field(s) for route '${route}':`,
        repairResult.modifications.map((m) => m.reason).join(' | ')
      );
    }

    // 3. Reset observer for this route so it can begin Phase 2 observation for vNext
    this.observer.resetRoute(route);

    // 4. Reroute through Phase 1 TypeSafe dynamic engine
    const res = await this.router.handle(effectivePayload, route, headers);

    // 5. Mark context as fallback and attach auto-repair metadata
    res.context.isFallback = true;
    if (repairResult.repaired) {
      res.context.autoRepaired = true;
      res.context.repairDetails = repairResult.modifications.map((m) => m.reason);
    }

    // 6. Feed this drifted payload into observer as sample 1 of vNext (with bidirectional response)
    await this.observer.observe(
      route,
      res.normalizedPayload,
      res.result,
      res.context.intentConfidence ?? 1.0
    );

    return res;
  }
}
