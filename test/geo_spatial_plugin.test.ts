import { describe, it, expect } from 'vitest';
import {
  encodeGeohash,
  getSpatialGridId,
  haversineDistanceMeters,
  createGeoSpatialPlugin,
} from '../plugins/plugin_geo_spatial.js';

describe('Geo-Spatial Plugin & Grid Perception Cache', () => {
  it('should encode coordinates to accurate Geohash strings', () => {
    // Taipei 101 coordinates: ~ 25.033964, 121.564468
    const hash = encodeGeohash(25.033964, 121.564468, 7);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(7);
    expect(hash.startsWith('wsqqq')).toBe(true);
  });

  it('should compute consistent spatial grid bins for nearby coordinates', () => {
    // Two coordinates within 5 meters of each other in Taipei
    const lat1 = 25.033964;
    const lon1 = 121.564468;

    const lat2 = 25.033970;
    const lon2 = 121.564472;

    const grid1 = getSpatialGridId(lat1, lon1, '100m');
    const grid2 = getSpatialGridId(lat2, lon2, '100m');

    // Both should snap to the exact same 100m grid bin ID
    expect(grid1).toBe(grid2);
    expect(grid1).toContain('grid:100m:');

    // Far coordinate (Kaohsiung) should yield a completely different grid ID
    const gridKaohsiung = getSpatialGridId(22.6273, 120.3014, '100m');
    expect(gridKaohsiung).not.toBe(grid1);
  });

  it('should calculate accurate Great-Circle distance using Haversine formula', () => {
    // Taipei Main Station (25.0477, 121.5170) to Taipei 101 (25.0339, 121.5645)
    // Distance is approximately ~5.0 - 5.2 km
    const dist = haversineDistanceMeters(25.0477, 121.5170, 25.0339, 121.5645);
    expect(dist).toBeGreaterThan(4900);
    expect(dist).toBeLessThan(5300);
  });

  it('should normalize coordinates in beforeRouteExecution hook', () => {
    const plugin = createGeoSpatialPlugin({
      defaultPrecision: '100m',
      snapPayloadCoords: true,
      autoDetectCoords: true,
    });

    const ctx: any = {
      route: 'get_nearby_parking',
      payload: {
        latitude: 25.033964,
        longitude: 121.564468,
        vehicle_type: 'car',
      },
    };

    const result = plugin.beforeRouteExecution(ctx);
    expect(result).toBeDefined();
    expect(result?.proceed).toBe(true);
    expect(result?.modifiedPayload._spatialGridId).toBeDefined();
    expect(result?.modifiedPayload._geohash).toBeDefined();
    expect(result?.modifiedPayload.latitude).toBeCloseTo(25.034, 2);
    expect(result?.modifiedPayload.longitude).toBeCloseTo(121.564, 2);
  });
});
