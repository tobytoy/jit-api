import { IRField, IRFieldType, IRSchema, StabilityMetrics } from './types.js';

export interface ObserverOptions {
  stabilityThreshold?: number; // Number of consecutive matching requests (default: 5)
  confidenceThreshold?: number; // Minimum average confidence required (default: 0.85)
  onFreeze?: (schema: IRSchema) => Promise<void> | void;
}

interface RouteObservationState {
  samples: Array<{
    payload: Record<string, unknown>;
    signature: string;
    confidence: number;
    timestamp: number;
  }>;
  currentSignature: string | null;
  consecutiveMatches: number;
  isFrozen: boolean;
  frozenSchema: IRSchema | null;
}

export class SchemaObserver {
  private options: Required<ObserverOptions>;
  private states: Map<string, RouteObservationState> = new Map();

  constructor(options?: ObserverOptions) {
    this.options = {
      stabilityThreshold: options?.stabilityThreshold ?? 5,
      confidenceThreshold: options?.confidenceThreshold ?? 0.85,
      onFreeze: options?.onFreeze ?? (() => {}),
    };
  }

  /**
   * Infer IRFieldType from JavaScript value
   */
  private inferType(value: unknown): IRFieldType {
    if (Array.isArray(value)) return 'array';
    if (value === null || value === undefined) return 'string';
    const type = typeof value;
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (type === 'object') return 'object';
    return 'string';
  }

  /**
   * Generate canonical schema signature for comparison
   */
  private generateSignature(payload: Record<string, unknown>): string {
    const keys = Object.keys(payload).sort();
    const parts = keys.map((key) => {
      const val = payload[key];
      const type = this.inferType(val);
      if (type === 'object' && val && typeof val === 'object') {
        return `${key}:{${this.generateSignature(val as Record<string, unknown>)}}`;
      }
      return `${key}:${type}`;
    });
    return parts.join(';');
  }

  /**
   * Extract complete IRSchema from stable payload sample
   */
  public extractIRSchema(route: string, sample: Record<string, unknown>, version = 1): IRSchema {
    const fields: Record<string, IRField> = {};

    for (const [key, val] of Object.entries(sample)) {
      const fieldType = this.inferType(val);
      const field: IRField = {
        name: key,
        type: fieldType,
        required: true,
      };

      if (fieldType === 'array' && Array.isArray(val) && val.length > 0) {
        field.itemType = this.inferType(val[0]);
      } else if (fieldType === 'object' && val && typeof val === 'object') {
        const nestedProps: Record<string, IRField> = {};
        for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
          nestedProps[subKey] = {
            name: subKey,
            type: this.inferType(subVal),
            required: true,
          };
        }
        field.properties = nestedProps;
      }

      fields[key] = field;
    }

    const pascalName = route
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Request';

    return {
      name: pascalName,
      version,
      route,
      fields,
      samplePayload: sample,
      frozenAt: new Date().toISOString(),
    };
  }

  /**
   * Phase 2: Record observation sample and evaluate stability
   */
  async observe(
    route: string,
    payload: Record<string, unknown>,
    confidence: number = 1.0
  ): Promise<{
    stable: boolean;
    consecutiveMatches: number;
    metrics: StabilityMetrics;
    frozenSchema?: IRSchema;
  }> {
    let state = this.states.get(route);
    if (!state) {
      state = {
        samples: [],
        currentSignature: null,
        consecutiveMatches: 0,
        isFrozen: false,
        frozenSchema: null,
      };
      this.states.set(route, state);
    }

    // If already frozen, return existing state
    if (state.isFrozen && state.frozenSchema) {
      return {
        stable: true,
        consecutiveMatches: state.consecutiveMatches,
        metrics: this.getMetrics(route),
        frozenSchema: state.frozenSchema,
      };
    }

    const signature = this.generateSignature(payload);
    state.samples.push({
      payload,
      signature,
      confidence,
      timestamp: Date.now(),
    });

    if (state.currentSignature === signature) {
      state.consecutiveMatches += 1;
    } else {
      state.currentSignature = signature;
      state.consecutiveMatches = 1;
    }

    const metrics = this.getMetrics(route);

    // Check if stability criteria is satisfied
    if (metrics.isStable && !state.isFrozen) {
      state.isFrozen = true;
      const schema = this.extractIRSchema(route, payload);
      state.frozenSchema = schema;

      // Invoke freeze callback (triggers compiler/codegen)
      await this.options.onFreeze(schema);

      return {
        stable: true,
        consecutiveMatches: state.consecutiveMatches,
        metrics,
        frozenSchema: schema,
      };
    }

    return {
      stable: false,
      consecutiveMatches: state.consecutiveMatches,
      metrics,
    };
  }

  /**
   * Retrieve stability metrics for a route
   */
  getMetrics(route: string): StabilityMetrics {
    const state = this.states.get(route);
    if (!state || state.samples.length === 0) {
      return {
        sampleCount: 0,
        consecutiveMatches: 0,
        requiredThreshold: this.options.stabilityThreshold,
        confidenceThreshold: this.options.confidenceThreshold,
        avgConfidence: 0,
        isStable: false,
      };
    }

    const recentSamples = state.samples.slice(-this.options.stabilityThreshold);
    const avgConfidence =
      recentSamples.reduce((sum, s) => sum + s.confidence, 0) / recentSamples.length;

    const isStable =
      state.consecutiveMatches >= this.options.stabilityThreshold &&
      avgConfidence >= this.options.confidenceThreshold;

    return {
      sampleCount: state.samples.length,
      consecutiveMatches: state.consecutiveMatches,
      requiredThreshold: this.options.stabilityThreshold,
      confidenceThreshold: this.options.confidenceThreshold,
      avgConfidence: Number(avgConfidence.toFixed(3)),
      isStable,
    };
  }

  isFrozen(route: string): boolean {
    return this.states.get(route)?.isFrozen ?? false;
  }

  getFrozenSchema(route: string): IRSchema | undefined {
    return this.states.get(route)?.frozenSchema ?? undefined;
  }

  /**
   * Reset route state (used for schema drift v2 evolution)
   */
  resetRoute(route: string): void {
    this.states.delete(route);
  }
}
