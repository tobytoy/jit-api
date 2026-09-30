import { describe, it, expect } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { AutoRepairer } from '../core/auto_repair.js';
import { JITEngine } from '../core/jit_engine.js';
import { MDLoader } from '../core/md_loader.js';

describe('Synonym Auto-Repair & Spec Composition Aggregator', () => {
  describe('Synonym Auto-Repair for Enums', () => {
    it('should parse enum synonyms from markdown field annotations', () => {
      const markdown = `# API: book_train
Version: 1.0.0
Stage: prod

## Fields
- rail_type: enum (鐵路類型)
  - tra: 台鐵 [同義詞: 臺鐵, 火車, 鐵路, TRA]
  - thsr: 高鐵 [synonyms: 台灣高鐵, 臺灣高鐵, THSR]
  - metro: 捷運 [同義詞: 地鐵, MRT, Subway]

\`\`\`javascript
return { success: true, booked: payload.rail_type };
\`\`\`
`;
      const spec = MDParser.parse(markdown);
      expect(spec.synonymMap).toBeDefined();
      expect(spec.synonymMap!['臺鐵']).toBe('tra');
      expect(spec.synonymMap!['火車']).toBe('tra');
      expect(spec.synonymMap!['臺灣高鐵']).toBe('thsr');
      expect(spec.synonymMap!['地鐵']).toBe('metro');
      expect(spec.synonymMap!['MRT']).toBe('metro');
    });

    it('should automatically repair synonym alias to canonical enum key', () => {
      const repairer = new AutoRepairer({
        synonymMap: {
          臺鐵: 'tra',
          火車: 'tra',
          自小客車: 'car',
        },
      });

      const rawPayload = {
        rail_type: '臺鐵',
        vehicle: '自小客車',
      };

      const result = repairer.repair(rawPayload, {
        rail_type: { name: 'rail_type', type: 'string', required: true },
        vehicle: { name: 'vehicle', type: 'string', required: true },
      });

      expect(result.repaired).toBe(true);
      expect(result.payload.rail_type).toBe('tra');
      expect(result.payload.vehicle).toBe('car');
      expect(result.modifications.length).toBe(2);
    });
  });

  describe('Spec Composition & Parallel Aggregator', () => {
    it('should parse ## Compose block and execute sub-routes in parallel', async () => {
      const engine = new JITEngine({ forceNeedle: true });
      const loader = new MDLoader('/virtual_compose_specs');

      // Sub-route 1: parking
      loader.addInlineSpec(
        'get_parking.api.md',
        `# API: get_parking
Stage: prod

## Fields
- lat: number (緯度)
- lon: number (經度)

## Logic
\`\`\`javascript
return { totalAvailable: 15, nearestLot: 'City Hall Lot' };
\`\`\`
`
      );

      // Sub-route 2: incidents
      loader.addInlineSpec(
        'get_incidents.api.md',
        `# API: get_incidents
Stage: prod

## Fields
- lat: number (緯度)
- lon: number (經度)

## Logic
\`\`\`javascript
return [{ type: 'CONSTRUCTION', road: 'Section 5' }];
\`\`\`
`
      );

      // Composed Route
      loader.addInlineSpec(
        'get_transport_context.api.md',
        `# API: get_transport_context
Stage: prod

## Compose
- Parallel:
    - parking: call(get_parking, { lat: payload.latitude, lon: payload.longitude })
    - incidents: call(get_incidents, { lat: payload.latitude, lon: payload.longitude })

## Fields
- latitude: number (緯度)
- longitude: number (經度)
`
      );

      loader.loadAll(engine);

      // Execute composed route
      const result = await engine.execute({
        route: 'get_transport_context',
        latitude: 25.0339,
        longitude: 121.5645,
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('COMPOSED');
      expect(result.data.composedData.parking).toBeDefined();
      expect(result.data.composedData.parking.totalAvailable).toBe(15);
      expect(result.data.composedData.incidents).toBeDefined();
      expect(result.data.composedData.incidents[0].type).toBe('CONSTRUCTION');
    });
  });
});
