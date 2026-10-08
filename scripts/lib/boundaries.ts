import { readFileSync } from "node:fs";
import * as turf from "@turf/turf";

/**
 * Boundary helpers for the geography seed (pure, DB-free; unit-tested).
 * GeoJSON types are derived from turf's own signatures because
 * @types/geojson is not hoisted to the project root under pnpm.
 */

export type AreaGeometry =
  | ReturnType<typeof turf.polygon>["geometry"]
  | ReturnType<typeof turf.multiPolygon>["geometry"];
/** Feature<Polygon | MultiPolygon> (one feature type, so turf generics infer the union) */
export type AreaFeature = ReturnType<typeof asFeature>;

export type BoundaryProps = { shapeName: string; shapeISO: string; shapeID: string };
export type BoundaryFeature = {
  type: "Feature";
  properties: BoundaryProps;
  geometry: AreaGeometry;
};

/** Read a geoBoundaries FeatureCollection of (Multi)Polygons. */
export function loadBoundaries(path: string): BoundaryFeature[] {
  const fc = JSON.parse(readFileSync(path, "utf8")) as { features: BoundaryFeature[] };
  for (const f of fc.features) {
    const type = (f.geometry as { type: string }).type;
    if (type !== "Polygon" && type !== "MultiPolygon") {
      throw new Error(`Unexpected geometry ${type} for ${f.properties.shapeName}`);
    }
  }
  return fc.features;
}

function asFeature(geometry: AreaGeometry) {
  return turf.feature(geometry);
}

/** Simplification tolerances (degrees) for boundary_geojson. */
export const STATE_SIMPLIFY_TOLERANCE = 0.01;
export const LGA_SIMPLIFY_TOLERANCE = 0.005;
/** Coordinate precision kept in boundary_geojson (4 dp ≈ 11 m). */
export const SIMPLIFIED_PRECISION = 4;

/**
 * Simplified copy for map rendering. Douglas–Peucker (turf.simplify,
 * highQuality false) then coordinates truncated to 4 dp. Never mutates the
 * input — the ORIGINAL geometry is what goes into the PostGIS `geom` column.
 */
export function simplifyGeometry(geometry: AreaGeometry, tolerance: number): AreaGeometry {
  const simplified = turf.simplify(asFeature(geometry), {
    tolerance,
    highQuality: false,
    mutate: false,
  });
  const truncated = turf.truncate(simplified, {
    precision: SIMPLIFIED_PRECISION,
    coordinates: 2,
    mutate: true,
  });
  return truncated.geometry;
}

/**
 * Representative centre [lon, lat]: centre of mass, or — when the centre of
 * mass falls outside the shape (crescent-shaped LGAs, coastal multipolygons)
 * — turf.pointOnFeature, which is guaranteed to lie inside.
 */
export function centreOf(geometry: AreaGeometry): [number, number] {
  const f = asFeature(geometry);
  const com = turf.centerOfMass(f);
  if (turf.booleanPointInPolygon(com, f)) {
    return com.geometry.coordinates as [number, number];
  }
  return turf.pointOnFeature(f).geometry.coordinates as [number, number];
}

type Indexed = { feature: AreaFeature; bbox: [number, number, number, number] };

function bboxOf(f: AreaFeature): [number, number, number, number] {
  return turf.bbox(f) as [number, number, number, number];
}

function bboxContains(b: [number, number, number, number], [x, y]: [number, number]) {
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
}

function bboxOverlaps(a: [number, number, number, number], b: [number, number, number, number]) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Spatial parent lookup: for each child (LGA), the index of its parent
 * (state). Primary rule: the child's centre (centreOf) inside the parent
 * polygon. Fallback when the centre falls outside every parent: the parent
 * with the largest intersection area.
 */
export function assignParents(
  parents: AreaGeometry[],
  children: { geometry: AreaGeometry; centre: [number, number] }[],
): { parentIdx: number[]; fallbacks: number } {
  const idx: Indexed[] = parents.map((g) => {
    const feature = asFeature(g);
    return { feature, bbox: bboxOf(feature) };
  });
  let fallbacks = 0;
  const parentIdx = children.map((child) => {
    const pt = turf.point(child.centre);
    for (let i = 0; i < idx.length; i++) {
      if (!bboxContains(idx[i].bbox, child.centre)) continue;
      if (turf.booleanPointInPolygon(pt, idx[i].feature)) return i;
    }
    fallbacks += 1;
    const cf = asFeature(child.geometry);
    const cb = bboxOf(cf);
    let best = -1;
    let bestArea = 0;
    for (let i = 0; i < idx.length; i++) {
      if (!bboxOverlaps(idx[i].bbox, cb)) continue;
      const inter = turf.intersect(turf.featureCollection([cf, idx[i].feature]));
      const a = inter ? turf.area(inter) : 0;
      if (a > bestArea) {
        bestArea = a;
        best = i;
      }
    }
    if (best < 0) throw new Error("Child boundary intersects no parent boundary");
    return best;
  });
  return { parentIdx, fallbacks };
}

/** Serialized byte size of a FeatureCollection of the given geometries. */
export function collectionBytes(geometries: AreaGeometry[]): number {
  return Buffer.byteLength(
    JSON.stringify({
      type: "FeatureCollection",
      features: geometries.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
    }),
  );
}
