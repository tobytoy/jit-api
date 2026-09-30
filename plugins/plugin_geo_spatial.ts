/**
 * JIT Protocol Synthesis Framework - Geo-Spatial & Grid Perception Cache Plugin
 * 
 * Provides pure-JS Geohash, spatial grid normalization, and distance algorithms.
 * Designed for 0-C++ edge execution (Cloudflare Workers, Bun, Deno, Node.js).
 * Snaps continuous floating-point GPS coordinates into spatial grid bins to maximize cache hits.
 */

import { JITPlugin, JITBeforeRouteContext, JITBeforeRouteResult } from '../core/plugin.js';

export type SpatialPrecision = '10m' | '50m' | '100m' | '500m' | '1km' | '5km' | '10km' | number;

export interface GeoSpatialPluginOptions {
  defaultPrecision?: SpatialPrecision;
  latField?: string;
  lonField?: string;
  autoDetectCoords?: boolean;
  snapPayloadCoords?: boolean;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode latitude/longitude to Geohash string
 */
export function encodeGeohash(lat: number, lon: number, precision = 7): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon >= lonMid) {
        idx = (idx << 1) + 1;
        lonMin = lonMid;
      } else {
        idx = (idx << 1) + 0;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = (idx << 1) + 1;
        latMin = latMid;
      } else {
        idx = (idx << 1) + 0;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Convert precision specifier to degrees delta approximately
 */
export function precisionToDegrees(precision: SpatialPrecision): number {
  if (typeof precision === 'number') {
    // Treat as meters
    return precision / 111320;
  }
  switch (precision) {
    case '10m':
      return 0.0001; // ~11m
    case '50m':
      return 0.0005; // ~55m
    case '100m':
      return 0.001; // ~111m
    case '500m':
      return 0.005; // ~556m
    case '1km':
      return 0.01; // ~1.11km
    case '5km':
      return 0.05; // ~5.56km
    case '10km':
      return 0.1; // ~11.1km
    default:
      return 0.001;
  }
}

/**
 * Compute normalized Spatial Grid ID for given coordinates and precision
 */
export function getSpatialGridId(lat: number, lon: number, precision: SpatialPrecision = '100m'): string {
  const delta = precisionToDegrees(precision);
  const gridLat = Math.round(lat / delta) * delta;
  const gridLon = Math.round(lon / delta) * delta;
  const precisionStr = typeof precision === 'string' ? precision : `${precision}m`;
  return `grid:${precisionStr}:${gridLat.toFixed(5)}:${gridLon.toFixed(5)}`;
}

/**
 * Calculate Great-Circle distance between two coordinates in meters (Haversine)
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class GeoSpatialPlugin implements JITPlugin {
  public name = 'plugin-geo-spatial';
  public version = '1.4.4';
  public description = 'Spatial grid cache normalization and Geohash engine for edge LBS routes';

  private defaultPrecision: SpatialPrecision;
  private latField?: string;
  private lonField?: string;
  private autoDetectCoords: boolean;
  private snapPayloadCoords: boolean;

  constructor(options?: GeoSpatialPluginOptions) {
    this.defaultPrecision = options?.defaultPrecision || '100m';
    this.latField = options?.latField;
    this.lonField = options?.lonField;
    this.autoDetectCoords = options?.autoDetectCoords ?? true;
    this.snapPayloadCoords = options?.snapPayloadCoords ?? false;
  }

  public beforeRouteExecution(ctx: JITBeforeRouteContext): JITBeforeRouteResult | void {
    if (!ctx.payload || typeof ctx.payload !== 'object') return;

    let lat: number | undefined;
    let lon: number | undefined;
    let latKey = this.latField;
    let lonKey = this.lonField;

    if (latKey && lonKey && ctx.payload[latKey] !== undefined && ctx.payload[lonKey] !== undefined) {
      lat = Number(ctx.payload[latKey]);
      lon = Number(ctx.payload[lonKey]);
    } else if (this.autoDetectCoords) {
      // Auto-detect common coordinate keys
      const candidateLatKeys = ['latitude', 'lat', 'y', 'gps_lat', 'coord_lat'];
      const candidateLonKeys = ['longitude', 'lon', 'lng', 'x', 'gps_lon', 'gps_lng', 'coord_lon'];

      for (const k of candidateLatKeys) {
        if (ctx.payload[k] !== undefined && !isNaN(Number(ctx.payload[k]))) {
          lat = Number(ctx.payload[k]);
          latKey = k;
          break;
        }
      }
      for (const k of candidateLonKeys) {
        if (ctx.payload[k] !== undefined && !isNaN(Number(ctx.payload[k]))) {
          lon = Number(ctx.payload[k]);
          lonKey = k;
          break;
        }
      }
    }

    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      const precision = ctx.payload._geoPrecision || this.defaultPrecision;
      const gridId = getSpatialGridId(lat, lon, precision);
      const geohash = encodeGeohash(lat, lon, 7);

      const modifiedPayload = {
        ...ctx.payload,
        _spatialGridId: gridId,
        _geohash: geohash,
      };

      if (this.snapPayloadCoords && latKey && lonKey) {
        const delta = precisionToDegrees(precision);
        modifiedPayload[latKey] = Number((Math.round(lat / delta) * delta).toFixed(5));
        modifiedPayload[lonKey] = Number((Math.round(lon / delta) * delta).toFixed(5));
      }

      return {
        proceed: true,
        modifiedPayload,
      };
    }
  }

  public getGridId(lat: number, lon: number, precision?: SpatialPrecision): string {
    return getSpatialGridId(lat, lon, precision || this.defaultPrecision);
  }

  public getGeohash(lat: number, lon: number, precision?: number): string {
    return encodeGeohash(lat, lon, precision);
  }

  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return haversineDistanceMeters(lat1, lon1, lat2, lon2);
  }
}

export function createGeoSpatialPlugin(options?: GeoSpatialPluginOptions): GeoSpatialPlugin {
  return new GeoSpatialPlugin(options);
}
