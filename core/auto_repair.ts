import { AutoRepairModification, AutoRepairResult, IRField } from './types.js';

export interface AutoRepairOptions {
  enableCaseConversion?: boolean;
  enableTypeCoercion?: boolean;
  enableAliasResolution?: boolean;
  enableSynonymResolution?: boolean;
  customAliases?: Record<string, string>; // e.g. { uid: 'user_id' }
  synonymMap?: Record<string, string>; // e.g. { '臺鐵': 'tra', '火車': 'tra' }
}

export class AutoRepairer {
  private options: Required<AutoRepairOptions>;

  constructor(options?: AutoRepairOptions) {
    this.options = {
      enableCaseConversion: options?.enableCaseConversion ?? true,
      enableTypeCoercion: options?.enableTypeCoercion ?? true,
      enableAliasResolution: options?.enableAliasResolution ?? true,
      enableSynonymResolution: options?.enableSynonymResolution ?? true,
      customAliases: options?.customAliases ?? {
        uid: 'user_id',
        id: 'order_id',
        qty: 'quantity',
        amt: 'amount',
        desc: 'description',
        msg: 'message',
      },
      synonymMap: options?.synonymMap ?? {},
    };
  }

  /**
   * Normalize string to canonical alphanumeric key for fuzzy comparison
   */
  private canonicalize(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Attempt to automatically repair a drifted payload against expected schema fields and synonym maps
   */
  public repair(
    rawPayload: Record<string, unknown>,
    expectedFields?: Record<string, IRField>,
    routeSynonyms?: Record<string, string>
  ): AutoRepairResult {
    if (!expectedFields || Object.keys(expectedFields).length === 0) {
      return {
        repaired: false,
        payload: { ...rawPayload },
        modifications: [],
      };
    }

    const repairedPayload: Record<string, unknown> = { ...rawPayload };
    const modifications: AutoRepairModification[] = [];
    const expectedKeys = Object.keys(expectedFields);

    // Build lookup of canonical names to actual expected field names
    const canonicalExpectedMap = new Map<string, string>();
    for (const key of expectedKeys) {
      canonicalExpectedMap.set(this.canonicalize(key), key);
    }

    // Phase 1: Key matching, case conversion & alias resolution
    for (const [rawKey, rawVal] of Object.entries(rawPayload)) {
      if (expectedKeys.includes(rawKey)) {
        continue; // Already directly matches an expected key
      }

      let targetKey: string | undefined;

      // 1. Case / Delimiter matching (e.g. userId -> user_id, user-id -> user_id)
      if (this.options.enableCaseConversion) {
        const canonical = this.canonicalize(rawKey);
        if (canonicalExpectedMap.has(canonical)) {
          targetKey = canonicalExpectedMap.get(canonical);
          if (targetKey && !(targetKey in repairedPayload)) {
            repairedPayload[targetKey] = rawVal;
            delete repairedPayload[rawKey];
            modifications.push({
              field: targetKey,
              type: 'rename',
              from: rawKey,
              to: targetKey,
              reason: `Normalized key delimiter/case mismatch from '${rawKey}' to '${targetKey}'`,
            });
            continue;
          }
        }
      }

      // 2. Alias resolution (e.g. uid -> user_id)
      if (this.options.enableAliasResolution) {
        const aliasTarget = this.options.customAliases[rawKey.toLowerCase()];
        if (aliasTarget && expectedKeys.includes(aliasTarget) && !(aliasTarget in repairedPayload)) {
          repairedPayload[aliasTarget] = rawVal;
          delete repairedPayload[rawKey];
          modifications.push({
            field: aliasTarget,
            type: 'alias',
            from: rawKey,
            to: aliasTarget,
            reason: `Resolved known alias from '${rawKey}' to '${aliasTarget}'`,
          });
          continue;
        }
      }
    }

    // Phase 2: Type Coercion
    if (this.options.enableTypeCoercion) {
      for (const [key, field] of Object.entries(expectedFields)) {
        if (!(key in repairedPayload)) continue;
        const currentVal = repairedPayload[key];

        if (field.type === 'number' && typeof currentVal === 'string') {
          const trimmed = currentVal.trim();
          if (trimmed !== '' && !isNaN(Number(trimmed))) {
            const num = Number(trimmed);
            repairedPayload[key] = num;
            modifications.push({
              field: key,
              type: 'coerce',
              from: currentVal,
              to: num,
              reason: `Coerced numeric string '${currentVal}' to number ${num}`,
            });
          }
        } else if (field.type === 'boolean' && typeof currentVal === 'string') {
          const lower = currentVal.trim().toLowerCase();
          if (lower === 'true' || lower === '1') {
            repairedPayload[key] = true;
            modifications.push({
              field: key,
              type: 'coerce',
              from: currentVal,
              to: true,
              reason: `Coerced boolean string '${currentVal}' to true`,
            });
          } else if (lower === 'false' || lower === '0') {
            repairedPayload[key] = false;
            modifications.push({
              field: key,
              type: 'coerce',
              from: currentVal,
              to: false,
              reason: `Coerced boolean string '${currentVal}' to false`,
            });
          }
        } else if (field.type === 'array' && typeof currentVal === 'string') {
          // Coerce comma-separated string to array
          if (currentVal.includes(',')) {
            const arr = currentVal.split(',').map((s) => s.trim());
            repairedPayload[key] = arr;
            modifications.push({
              field: key,
              type: 'coerce',
              from: currentVal,
              to: arr,
              reason: `Coerced comma-separated string to array`,
            });
          }
        }
      }
    }

    // Phase 3: Synonym / Value Normalization (e.g. '臺鐵' -> 'tra', '火車' -> 'tra')
    if (this.options.enableSynonymResolution) {
      const mergedSynonyms = { ...this.options.synonymMap, ...(routeSynonyms || {}) };
      const synonymKeys = Object.keys(mergedSynonyms);
      if (synonymKeys.length > 0) {
        for (const [key, val] of Object.entries(repairedPayload)) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            const lower = trimmed.toLowerCase();
            const matchedKey = synonymKeys.find(
              (s) => s.toLowerCase() === lower || s === trimmed
            );
            if (matchedKey) {
              const canonical = mergedSynonyms[matchedKey];
              if (canonical !== val) {
                repairedPayload[key] = canonical;
                modifications.push({
                  field: key,
                  type: 'alias',
                  from: val,
                  to: canonical,
                  reason: `Resolved synonym alias for '${key}' from '${val}' to '${canonical}'`,
                });
              }
            }
          }
        }
      }
    }

    return {
      repaired: modifications.length > 0,
      payload: repairedPayload,
      modifications,
    };
  }
}
