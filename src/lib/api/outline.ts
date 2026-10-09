import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";

/**
 * Lightweight static SVG outline for custom-area previews (server-rendered,
 * pure). Fits the geometry into a w×h box with a Mercator projection.
 *
 * Note: d3-geo expects spherical winding (exterior rings clockwise). GeoJSON
 * RFC 7946 rings are counter-clockwise, which d3 would read as "the whole
 * globe minus the polygon" — so rings are rewound before projecting.
 */

type Ring = [number, number][];
type Geom = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return a / 2;
}

/** Exterior rings clockwise (negative planar area), holes counter-clockwise — d3-geo's convention. */
function rewindPolygon(rings: Ring[]): Ring[] {
  return rings.map((r, i) => {
    const cw = signedArea(r) < 0;
    const wantCw = i === 0;
    return cw === wantCw ? r : [...r].reverse();
  });
}

export function rewindForD3(g: Geom): Geom {
  if (g.type === "Polygon") return { type: "Polygon", coordinates: rewindPolygon(g.coordinates) };
  return { type: "MultiPolygon", coordinates: g.coordinates.map(rewindPolygon) };
}

export type Outline = { d: string; width: number; height: number };

export function outlinePath(geoms: Geom[], width = 240, height = 180, pad = 8): Outline | null {
  if (!geoms.length) return null;
  const collection = {
    type: "FeatureCollection",
    features: geoms.map((g) => ({ type: "Feature", properties: {}, geometry: rewindForD3(g) })),
  } as unknown as GeoPermissibleObjects;
  const projection = geoMercator().fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    collection,
  );
  const d = geoPath(projection)(collection);
  if (!d) return null;
  return { d, width, height };
}

/** Narrow unknown jsonb (lgas.boundary_geojson / polygon_geojson) to a Polygon/MultiPolygon. */
export function asGeom(v: unknown): Geom | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { type?: unknown; coordinates?: unknown; geometry?: unknown };
  if (o.type === "Feature") return asGeom(o.geometry);
  if ((o.type === "Polygon" || o.type === "MultiPolygon") && Array.isArray(o.coordinates)) return o as Geom;
  return null;
}
