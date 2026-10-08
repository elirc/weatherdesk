import path from "node:path";
import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import {
  assignParents,
  centreOf,
  collectionBytes,
  LGA_SIMPLIFY_TOLERANCE,
  loadBoundaries,
  simplifyGeometry,
  STATE_SIMPLIFY_TOLERANCE,
  type AreaGeometry,
} from "../../../scripts/lib/boundaries";

const raw = (f: string) => path.resolve(__dirname, "../../../data/boundaries/raw", f);
const lgaFeatures = loadBoundaries(raw("nga-adm2-simplified.geojson"));
const stateFeatures = loadBoundaries(raw("nga-adm1-simplified.geojson"));

describe("simplification size budget", () => {
  it("whole national LGA layer serializes well under 1.5 MB", () => {
    expect(lgaFeatures).toHaveLength(774);
    const simplified = lgaFeatures.map((f) => simplifyGeometry(f.geometry, LGA_SIMPLIFY_TOLERANCE));
    const bytes = collectionBytes(simplified);
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
    // and it actually shrank the source
    expect(bytes).toBeLessThan(collectionBytes(lgaFeatures.map((f) => f.geometry)));
  });

  it("state layer stays small", () => {
    const simplified = stateFeatures.map((f) => simplifyGeometry(f.geometry, STATE_SIMPLIFY_TOLERANCE));
    expect(collectionBytes(simplified)).toBeLessThan(300 * 1024);
  });

  it("keeps every ring a valid closed ring and does not mutate the input", () => {
    const f = lgaFeatures[0];
    const before = JSON.stringify(f.geometry);
    const s = simplifyGeometry(f.geometry, LGA_SIMPLIFY_TOLERANCE);
    expect(JSON.stringify(f.geometry)).toBe(before);
    const rings = s.type === "Polygon" ? s.coordinates : s.coordinates.flat();
    for (const ring of rings) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });
});

describe("centreOf", () => {
  it("returns a point inside a concave (C-shaped) polygon", () => {
    const c: AreaGeometry = {
      type: "Polygon",
      coordinates: [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0]]],
    };
    const [x, y] = centreOf(c);
    expect(turf.booleanPointInPolygon([x, y], turf.polygon(c.coordinates))).toBe(true);
  });
});

describe("assignParents", () => {
  const sq = (x0: number, y0: number, x1: number, y1: number): AreaGeometry => ({
    type: "Polygon",
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  });

  it("uses centre-in-polygon, falling back to largest overlap", () => {
    const parents = [sq(0, 0, 10, 10), sq(10, 0, 20, 10)];
    const inside = { geometry: sq(1, 1, 3, 3), centre: [2, 2] as [number, number] };
    // centre deliberately outside both parents; 70% of the area is in parent 1
    const straddle = { geometry: sq(7, 1, 17, 3), centre: [30, 30] as [number, number] };
    const { parentIdx, fallbacks } = assignParents(parents, [inside, straddle]);
    expect(parentIdx).toEqual([0, 1]);
    expect(fallbacks).toBe(1);
  });

  it("assigns all 774 real LGAs with the official per-state counts", () => {
    const { parentIdx } = assignParents(
      stateFeatures.map((f) => f.geometry),
      lgaFeatures.map((f) => ({ geometry: f.geometry, centre: centreOf(f.geometry) })),
    );
    const per = new Map<string, number>();
    parentIdx.forEach((i) => {
      const n = stateFeatures[i].properties.shapeName;
      per.set(n, (per.get(n) ?? 0) + 1);
    });
    expect(per.get("Kano")).toBe(44);
    expect(per.get("Katsina")).toBe(34);
    expect(per.get("Lagos")).toBe(20);
    expect(per.get("Abuja Federal Capital Territory")).toBe(6);
    expect(per.get("Bayelsa")).toBe(8);
    expect([...per.values()].reduce((a, b) => a + b, 0)).toBe(774);
  }, 60_000);
});
