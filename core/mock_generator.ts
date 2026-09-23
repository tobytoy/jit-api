import { IRField } from './types.js';

export class MockGenerator {
  /**
   * Generate realistic mock value for a single field based on name and type heuristics
   */
  public static generateFieldValue(fieldName: string, field: IRField): unknown {
    const lowerName = fieldName.toLowerCase();

    // 1. Enum fields
    if (field.enumValues && field.enumValues.length > 0) {
      return field.enumValues[Math.floor(Math.random() * field.enumValues.length)];
    }

    // 2. Number heuristics
    if (field.type === 'number') {
      if (/price|amount|cost|fee|balance|total|revenue/i.test(lowerName)) {
        return Math.floor(Math.random() * 50000 + 100) / 100;
      }
      if (/quantity|qty|count|stock|age/i.test(lowerName)) {
        return Math.floor(Math.random() * 20 + 1);
      }
      if (/id$/i.test(lowerName)) {
        return Math.floor(Math.random() * 90000 + 10000);
      }
      return Math.floor(Math.random() * 500 + 1);
    }

    // 3. Boolean heuristics
    if (field.type === 'boolean') {
      return true;
    }

    // 4. Array heuristics
    if (field.type === 'array') {
      const itemType = field.itemType || 'string';
      if (itemType === 'number') return [10, 25, 42];
      if (itemType === 'boolean') return [true, false];
      if (/tag|label|category/i.test(lowerName)) {
        return ['standard', 'priority'];
      }
      return ['item_1', 'item_2'];
    }

    // 5. Object heuristics
    if (field.type === 'object') {
      if (field.properties && Object.keys(field.properties).length > 0) {
        return this.generateMockFromFields(field.properties);
      }
      return { id: 101, status: 'INITIAL' };
    }

    // 6. String heuristics
    if (/email/i.test(lowerName)) {
      const rnd = Math.floor(Math.random() * 9000 + 1000);
      return `user_${rnd}@example.com`;
    }
    if (/phone|mobile|tel/i.test(lowerName)) {
      return '+886912345678';
    }
    if (/order_?id/i.test(lowerName)) {
      return `ORD-${Math.floor(Math.random() * 900000 + 100000)}`;
    }
    if (/user_?id|cust_?id|customer_?id/i.test(lowerName)) {
      return `USR-${Math.floor(Math.random() * 90000 + 10000)}`;
    }
    if (/uuid/i.test(lowerName)) {
      return 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    }
    if (/status|state/i.test(lowerName)) {
      return 'SUCCESS';
    }
    if (/date|created_?at|updated_?at|time/i.test(lowerName)) {
      return new Date().toISOString();
    }
    if (/url|link|avatar|image/i.test(lowerName)) {
      return `https://example.com/assets/${fieldName}.png`;
    }
    if (/name|username|author/i.test(lowerName)) {
      const names = ['Alice Chen', 'Bob Lin', 'Carol Wu', 'David Wang'];
      return names[Math.floor(Math.random() * names.length)];
    }
    if (/desc|description|title|message|msg|text|summary/i.test(lowerName)) {
      return `Sample ${fieldName} content for testing`;
    }

    return `sample_${fieldName}`;
  }

  /**
   * Generate complete mock object from IRField map
   */
  public static generateMockFromFields(fields: Record<string, IRField>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(fields)) {
      result[name] = this.generateFieldValue(name, field);
    }
    return result;
  }

  /**
   * Helper to convert snake_case to camelCase
   */
  private static toCamelCase(str: string): string {
    return str.replace(/_([a-z0-9])/g, (_, p1) => p1.toUpperCase());
  }

  /**
   * Generate Fuzzed/Drifted payload from a valid payload:
   * Converts keys to camelCase, stringifies numbers & booleans
   */
  public static fuzzPayload(validPayload: Record<string, unknown>): Record<string, unknown> {
    const fuzzed: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(validPayload)) {
      const camelKey = this.toCamelCase(k);

      if (typeof v === 'number') {
        fuzzed[camelKey] = String(v);
      } else if (typeof v === 'boolean') {
        fuzzed[camelKey] = v ? 'true' : 'false';
      } else if (Array.isArray(v)) {
        fuzzed[camelKey] = v.join(',');
      } else {
        fuzzed[camelKey] = v;
      }
    }

    return fuzzed;
  }

  /**
   * Generate Chaos payload from a valid payload:
   * Injects edge-case values, negative numbers, extreme lengths, and exploit patterns
   */
  public static chaosPayload(validPayload: Record<string, unknown>): Record<string, unknown> {
    const chaos: Record<string, unknown> = { ...validPayload };
    const chaosInjections: unknown[] = [
      '',
      -999999,
      999999999999,
      null,
      "' OR 1=1 --",
      '<script>alert(1)</script>',
      'A'.repeat(500),
    ];

    const keys = Object.keys(chaos);
    if (keys.length > 0) {
      const targetKey = keys[Math.floor(Math.random() * keys.length)];
      const injection = chaosInjections[Math.floor(Math.random() * chaosInjections.length)];
      chaos[targetKey] = injection;
    }

    return chaos;
  }
}
