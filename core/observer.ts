import { IRField, IRFieldType, IRSchema, SchemaSnapshot, StabilityMetrics } from './types.js';

export interface ObserverOptions {
  stabilityThreshold?: number; // Number of consecutive matching requests (default: 5)
  confidenceThreshold?: number; // Minimum average confidence required (default: 0.85)
  onFreeze?: (schema: IRSchema) => Promise<void> | void;
}

interface RouteObservationState {
  samples: Array<{
    payload: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    signature: string;
    confidence: number;
    timestamp: number;
  }>;
  currentSignature: string | null;
  consecutiveMatches: number;
  isFrozen: boolean;
  frozenSchema: IRSchema | null;
  lastResponsePayload?: Record<string, unknown>;
}

export class SchemaObserver {
  private options: Required<ObserverOptions>;
  private states: Map<string, RouteObservationState> = new Map();
  private evolutionStates: Map<string, RouteObservationState> = new Map();
  private routeVersions: Map<string, number> = new Map();
  private frozenVersions: Map<string, Map<number, IRSchema>> = new Map();

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
  public inferType(value: unknown): IRFieldType {
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
  public generateSignature(payload: Record<string, unknown>): string {
    const keys = Object.keys(payload).sort();
    const parts = keys.map((key) => {
      const val = payload[key];
      const type = this.inferType(val);
      if (type === 'object' && val && typeof val === 'object') {
        return `${key}:{${this.generateSignature(val as Record<string, unknown>)}}`;
      }
      if (type === 'array' && Array.isArray(val)) {
        const itemType = val.length > 0 ? this.inferType(val[0]) : 'unknown';
        return `${key}:array[${itemType}]`;
      }
      return `${key}:${type}`;
    });
    return parts.join(';');
  }

  /**
   * Extract IRField map from object sample
   */
  public extractFields(sample: Record<string, unknown>): Record<string, IRField> {
    const fields: Record<string, IRField> = {};

    for (const [key, val] of Object.entries(sample)) {
      const fieldType = this.inferType(val);
      const field: IRField = {
        name: key,
        type: fieldType,
        required: true,
      };

      if (fieldType === 'array' && Array.isArray(val)) {
        field.itemType = val.length > 0 ? this.inferType(val[0]) : 'string';
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

    return fields;
  }

  /**
   * Extract complete IRSchema from stable payload sample (Request + optional Response)
   */
  public extractIRSchema(
    route: string,
    sample: Record<string, unknown>,
    sampleResponse?: Record<string, unknown>,
    version?: number
  ): IRSchema {
    const resolvedVersion = version ?? this.getRouteVersion(route);
    const fields = this.extractFields(sample);
    const responseFields =
      sampleResponse && typeof sampleResponse === 'object' && !Array.isArray(sampleResponse)
        ? this.extractFields(sampleResponse)
        : undefined;

    const pascalName =
      route
        .split(/[_-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('') + 'Request';

    return {
      name: pascalName,
      version: resolvedVersion,
      route,
      fields,
      responseFields,
      samplePayload: sample,
      sampleResponse,
      frozenAt: new Date().toISOString(),
    };
  }

  /**
   * Phase 2: Record observation sample and evaluate stability
   */
  async observe(
    route: string,
    payload: Record<string, unknown>,
    resOrConfidence?: Record<string, unknown> | number,
    maybeConfidence: number = 1.0
  ): Promise<{
    stable: boolean;
    consecutiveMatches: number;
    metrics: StabilityMetrics;
    frozenSchema?: IRSchema;
  }> {
    let responsePayload: Record<string, unknown> | undefined;
    let confidence = 1.0;

    if (typeof resOrConfidence === 'number') {
      confidence = resOrConfidence;
    } else if (resOrConfidence && typeof resOrConfidence === 'object') {
      responsePayload = resOrConfidence;
      confidence = maybeConfidence;
    }

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

    if (responsePayload) {
      state.lastResponsePayload = responsePayload;
    }

    // If already frozen for current version, return existing state
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
      responsePayload,
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
      const schema = this.extractIRSchema(
        route,
        payload,
        state.lastResponsePayload,
        this.getRouteVersion(route)
      );
      state.frozenSchema = schema;

      // Save to multi-version store
      this.saveFrozenVersion(schema);

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
   * Observe smooth schema evolution for an already-frozen route (Soft Drift Evolution)
   */
  async observeEvolution(
    route: string,
    payload: Record<string, unknown>,
    responsePayload?: Record<string, unknown>
  ): Promise<{
    evolved: boolean;
    consecutiveMatches: number;
    newSchema?: IRSchema;
  }> {
    let state = this.evolutionStates.get(route);
    if (!state) {
      state = {
        samples: [],
        currentSignature: null,
        consecutiveMatches: 0,
        isFrozen: false,
        frozenSchema: null,
      };
      this.evolutionStates.set(route, state);
    }

    if (responsePayload) {
      state.lastResponsePayload = responsePayload;
    }

    const signature = this.generateSignature(payload);
    state.samples.push({
      payload,
      responsePayload,
      signature,
      confidence: 1.0,
      timestamp: Date.now(),
    });

    if (state.currentSignature === signature) {
      state.consecutiveMatches += 1;
    } else {
      state.currentSignature = signature;
      state.consecutiveMatches = 1;
    }

    // When evolution threshold is reached, synthesize and freeze vNext
    if (state.consecutiveMatches >= this.options.stabilityThreshold) {
      const nextVersion = this.getRouteVersion(route) + 1;
      this.routeVersions.set(route, nextVersion);

      const newSchema = this.extractIRSchema(
        route,
        payload,
        state.lastResponsePayload,
        nextVersion
      );

      // Update main route state to point to new schema
      const mainState = this.states.get(route) || {
        samples: [],
        currentSignature: signature,
        consecutiveMatches: state.consecutiveMatches,
        isFrozen: true,
        frozenSchema: newSchema,
      };
      mainState.isFrozen = true;
      mainState.frozenSchema = newSchema;
      this.states.set(route, mainState);

      this.saveFrozenVersion(newSchema);
      this.evolutionStates.delete(route);

      await this.options.onFreeze(newSchema);

      return {
        evolved: true,
        consecutiveMatches: state.consecutiveMatches,
        newSchema,
      };
    }

    return {
      evolved: false,
      consecutiveMatches: state.consecutiveMatches,
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

  public isFrozen(route: string): boolean {
    return this.states.get(route)?.isFrozen ?? false;
  }

  public hasFrozenVersions(route: string): boolean {
    return (this.frozenVersions.get(route)?.size ?? 0) > 0;
  }

  public getFrozenSchema(route: string, version?: number): IRSchema | undefined {
    if (version !== undefined) {
      return this.frozenVersions.get(route)?.get(version);
    }
    const state = this.states.get(route);
    if (state?.frozenSchema) return state.frozenSchema;

    const versions = this.getFrozenSchemas(route);
    return versions.length > 0 ? versions[0] : undefined;
  }

  public getFrozenSchemas(route: string): IRSchema[] {
    const verMap = this.frozenVersions.get(route);
    if (!verMap || verMap.size === 0) {
      const single = this.states.get(route)?.frozenSchema;
      return single ? [single] : [];
    }
    return Array.from(verMap.values()).sort((a, b) => b.version - a.version);
  }

  private saveFrozenVersion(schema: IRSchema): void {
    let verMap = this.frozenVersions.get(schema.route);
    if (!verMap) {
      verMap = new Map();
      this.frozenVersions.set(schema.route, verMap);
    }
    verMap.set(schema.version, schema);
  }

  /**
   * Reset route state (used for schema drift v2 evolution)
   * Note: Preserves previous frozen version in frozenVersions for multi-version co-existence
   */
  resetRoute(route: string): void {
    const nextVersion = this.getRouteVersion(route) + 1;
    this.routeVersions.set(route, nextVersion);
    this.states.delete(route);
    this.evolutionStates.delete(route);
  }

  getRouteVersion(route: string): number {
    return this.routeVersions.get(route) || 1;
  }

  /**
   * Export all frozen schema snapshots for persistence
   */
  exportSnapshots(): SchemaSnapshot {
    const snapshotSchemas: Record<string, IRSchema[]> = {};
    for (const [route, verMap] of this.frozenVersions.entries()) {
      snapshotSchemas[route] = Array.from(verMap.values()).sort((a, b) => a.version - b.version);
    }
    return {
      exportedAt: new Date().toISOString(),
      version: '1.3.0',
      schemas: snapshotSchemas,
    };
  }

  /**
   * Import snapshot schemas to restore Phase 3 frozen state
   */
  importSnapshots(snapshot: SchemaSnapshot): void {
    for (const [route, schemas] of Object.entries(snapshot.schemas)) {
      let maxVer = 1;
      for (const s of schemas) {
        this.saveFrozenVersion(s);
        if (s.version > maxVer) maxVer = s.version;
      }
      this.routeVersions.set(route, maxVer);
      const latest = schemas.find((s) => s.version === maxVer) || schemas[schemas.length - 1];
      if (latest) {
        this.states.set(route, {
          samples: [],
          currentSignature: this.generateSignature(latest.samplePayload || {}),
          consecutiveMatches: this.options.stabilityThreshold,
          isFrozen: true,
          frozenSchema: latest,
        });
      }
    }
  }
}
