import { describe, expect, it } from "vitest";
import type { AreaGeometry } from "@/lib/geo/types";
import { buildMapModel, d3Winding, parseMapSvg, renderMapSvg } from "@/reports/svg-maps";
import { PCT_BINS, NO_DATA_COLOR } from "@/reports/scales";

/** RFC 7946 (counter-clockwise exterior) squares in Nigeria. */
function square(lon: number, lat: number, size = 1): AreaGeometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon + size, lat],
        [lon + size, lat + size],
        [lon, lat + size],
        [lon, lat],
      ],
    ],
  };
}

const fixture = [
  { name: "Alpha", geometry: square(4, 7), value: 79 },
  { name: "Beta & Co", geometry: square(6, 9), value: 121 },
  {
    name: "Gamma",
    geometry: { type: "MultiPolygon", coordinates: [square(9, 11).coordinates as number[][][]] } as AreaGeometry,
    value: null,
  },
];

describe("svg maps", () => {
  const model = buildMapModel({ title: "Rainfall as % of normal", subtitle: "Test · by LGA", legendTitle: "% of normal", scale: "pct", features: fixture });
  const svg = renderMapSvg(model);

  it("produces a well-formed svg with one path per feature", () => {
    expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
    expect(svg).not.toMatch(/<script|<style| id=/);
    expect(svg).toContain("Beta &amp; Co");
    expect(svg).toContain("OpenStreetMap");
  });

  it("colours by band and marks missing data", () => {
    expect(model.paths.map((p) => p.fill)).toEqual([PCT_BINS[1].color, PCT_BINS[3].color, NO_DATA_COLOR]);
  });

  it("projects inside the frame (winding fixed — no world-sized polygons)", () => {
    for (const p of model.paths) {
      const nums = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(model.width);
      }
    }
  });

  it("round-trips through parseMapSvg for the PDF renderer", () => {
    const parsed = parseMapSvg(svg);
    expect(parsed.width).toBe(model.width);
    expect(parsed.paths).toEqual(model.paths.map((p) => ({ d: p.d, fill: p.fill })));
    expect(parsed.context).toBeNull();
  });

  it("context layer adds exactly one path", () => {
    const m2 = buildMapModel({ title: "t", legendTitle: "l", scale: "rain", features: fixture.slice(0, 1), context: [square(5, 5)] });
    const s2 = renderMapSvg(m2);
    expect((s2.match(/<path /g) ?? []).length).toBe(2);
    expect(parseMapSvg(s2).context).not.toBeNull();
  });

  it("d3Winding reverses RFC-wound rings only", () => {
    const fixed = d3Winding(square(4, 7)) as { type: "Polygon"; coordinates: number[][][] };
    expect(fixed.coordinates[0][1]).toEqual([4, 8]);
    expect(d3Winding(fixed)).toEqual(fixed);
  });
});
