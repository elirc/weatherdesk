import { NIGERIA_BBOX } from "@/lib/geo/zones";

/**
 * Custom-area polygon validation (pure). Accepts a GeoJSON Polygon,
 * MultiPolygon, or a Feature wrapping one; returns a normalised
 * MultiPolygon. Checks: structure, ≥ 4 positions per ring, closed rings,
 * finite lon/lat inside the Nigeria bbox, non-zero area, bounded size.
 * Topological validity (self-intersection) is re-checked in PostGIS
 * (ST_IsValid) before insert.
 */

export type Position = [number, number];
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };

export const MAX_POLYGON_VERTICES = 5000;

export type PolygonResult = { ok: true; geometry: MultiPolygonGeometry; vertices: number } | { ok: false; error: string };

function ringArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return a / 2;
}

function parsePosition(p: unknown): Position | string {
  if (!Array.isArray(p) || p.length < 2) return "each position must be [lon, lat]";
  const [lon, lat] = p;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return "coordinates must be finite numbers";
  }
  if (lat < NIGERIA_BBOX.minLat || lat > NIGERIA_BBOX.maxLat || lon < NIGERIA_BBOX.minLon || lon > NIGERIA_BBOX.maxLon) {
    return `coordinate [${lon}, ${lat}] is outside Nigeria (positions are [longitude, latitude])`;
  }
  return [lon, lat];
}

function parsePolygon(coords: unknown): Position[][] | string {
  if (!Array.isArray(coords) || coords.length === 0) return "a polygon needs at least one ring";
  const rings: Position[][] = [];
  for (const r of coords) {
    if (!Array.isArray(r) || r.length < 4) return "each ring needs at least 4 positions (first = last)";
    const ring: Position[] = [];
    for (const p of r) {
      const pos = parsePosition(p);
      if (typeof pos === "string") return pos;
      ring.push(pos);
    }
    const [f, l] = [ring[0]!, ring[ring.length - 1]!];
    if (f[0] !== l[0] || f[1] !== l[1]) return "rings must be closed (first position equals last)";
    if (Math.abs(ringArea(ring)) < 1e-10) return "ring has zero area";
    rings.push(ring);
  }
  return rings;
}

export function validateAreaGeojson(input: unknown): PolygonResult {
  let g = input;
  if (typeof g === "string") {
    try {
      g = JSON.parse(g);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
  }
  if (!g || typeof g !== "object") return { ok: false, error: "expected a GeoJSON object" };
  const obj = g as { type?: unknown; geometry?: unknown; coordinates?: unknown };
  if (obj.type === "Feature") return validateAreaGeojson(obj.geometry);
  let polys: Position[][][] = [];
  if (obj.type === "Polygon") {
    const p = parsePolygon(obj.coordinates);
    if (typeof p === "string") return { ok: false, error: p };
    polys = [p];
  } else if (obj.type === "MultiPolygon") {
    if (!Array.isArray(obj.coordinates) || obj.coordinates.length === 0) {
      return { ok: false, error: "MultiPolygon needs at least one polygon" };
    }
    for (const c of obj.coordinates) {
      const p = parsePolygon(c);
      if (typeof p === "string") return { ok: false, error: p };
      polys.push(p);
    }
  } else {
    return { ok: false, error: "geometry must be a Polygon or MultiPolygon" };
  }
  const vertices = polys.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
  if (vertices > MAX_POLYGON_VERTICES) {
    return { ok: false, error: `too many vertices (${vertices} > ${MAX_POLYGON_VERTICES}) — simplify the shape` };
  }
  return { ok: true, geometry: { type: "MultiPolygon", coordinates: polys }, vertices };
}
