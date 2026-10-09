import { geoArea, geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { AreaGeometry, Position } from "@/lib/geo/types";
import { scaleFor, type LegendItem, type ScaleKind } from "./scales";

/**
 * Server-side report maps (no DOM). d3-geo projects A1's simplified boundary
 * layers; a quantising path context turns them into compact path strings.
 * The SAME MapModel feeds two renderers:
 *   - renderMapSvg(model): inline-safe <svg> markup string (web content JSON)
 *   - pdf.tsx: react-pdf <Svg>/<Path> primitives (react-pdf cannot rasterise
 *     arbitrary SVG strings, so the PDF rebuilds the map from the model).
 */

export const MAP_ATTRIBUTION = "Data: Open-Meteo, NASA POWER · Boundaries: geoBoundaries/GRID3 · © OpenStreetMap contributors";

export type MapFeatureInput = {
  name: string;
  geometry: AreaGeometry;
  value: number | null;
};

export type MapPath = { d: string; fill: string; name: string };

export type MapModel = {
  width: number;
  height: number;
  title: string;
  subtitle: string | null;
  paths: MapPath[];
  /** greyed-out surrounding features (e.g. the rest of the state around a custom area) */
  context: string[];
  legend: LegendItem[];
  legendTitle: string;
  attribution: string;
  /** map frame, for renderers */
  frame: { x: number; y: number; w: number; h: number };
  legendX: number;
};

/** Pixel-quantising d3 path context: rounds to 0.1 px, drops sub-pixel steps and degenerate rings. */
class QuantContext {
  private out: string[] = [];
  private ring: string[] = [];
  private ringPts = 0;
  private lx = 0;
  private ly = 0;
  private minX = 0;
  private maxX = 0;
  private minY = 0;
  private maxY = 0;

  constructor(
    private readonly minStep: number,
    private readonly minRingSize: number,
  ) {}

  private q(v: number): string {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  moveTo(x: number, y: number): void {
    this.flushRing();
    this.ring = [`M${this.q(x)},${this.q(y)}`];
    this.ringPts = 1;
    this.lx = x;
    this.ly = y;
    this.minX = this.maxX = x;
    this.minY = this.maxY = y;
  }

  lineTo(x: number, y: number): void {
    const dx = x - this.lx;
    const dy = y - this.ly;
    if (dx * dx + dy * dy < this.minStep * this.minStep) return;
    this.ring.push(`L${this.q(x)},${this.q(y)}`);
    this.ringPts += 1;
    this.lx = x;
    this.ly = y;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  closePath(): void {
    this.ring.push("Z");
    this.flushRing();
  }

  arc(): void {
    /* not used for polygons */
  }

  private flushRing(): void {
    if (!this.ring.length) return;
    const big = this.maxX - this.minX >= this.minRingSize || this.maxY - this.minY >= this.minRingSize;
    if (this.ringPts >= 3 && big) this.out.push(this.ring.join(""));
    this.ring = [];
    this.ringPts = 0;
  }

  result(): string {
    this.flushRing();
    const s = this.out.join("");
    this.out = [];
    return s;
  }
}

/**
 * d3-geo uses spherical winding: exterior rings must be CLOCKWISE, the
 * opposite of RFC 7946 GeoJSON. A polygon whose spherical area exceeds a
 * hemisphere was wound the RFC way — reverse its rings.
 */
export function d3Winding(geometry: AreaGeometry): AreaGeometry {
  const fixPoly = (rings: Position[][]): Position[][] => {
    const area = geoArea({ type: "Polygon", coordinates: rings } as GeoPermissibleObjects);
    return area > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings;
  };
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: fixPoly(geometry.coordinates) };
  return { type: "MultiPolygon", coordinates: geometry.coordinates.map(fixPoly) };
}

const MIN_STEP_PX = 1.1;
const MIN_RING_PX = 1;

/** wound-geometry and projected-path caches, keyed by geometry object identity */
const woundCache = new WeakMap<AreaGeometry, AreaGeometry>();
const pathCache = new WeakMap<AreaGeometry, { fitKey: string; d: string }>();

function wound(g: AreaGeometry): AreaGeometry {
  let w = woundCache.get(g);
  if (!w) {
    w = d3Winding(g);
    woundCache.set(g, w);
  }
  return w;
}

function asGeo(geoms: AreaGeometry[]): GeoPermissibleObjects {
  return {
    type: "FeatureCollection",
    features: geoms.map((g) => ({ type: "Feature", properties: {}, geometry: g })),
  } as unknown as GeoPermissibleObjects;
}

export function buildMapModel(opts: {
  title: string;
  subtitle?: string | null;
  legendTitle: string;
  scale: ScaleKind;
  features: MapFeatureInput[];
  context?: AreaGeometry[];
  width?: number;
  height?: number;
}): MapModel {
  const width = opts.width ?? 640;
  const height = opts.height ?? 520;
  const legendW = 150;
  const top = opts.subtitle ? 50 : 36;
  const frame = { x: 8, y: top, w: width - legendW - 24, h: height - top - 28 };
  const scale = scaleFor(opts.scale);

  const features = opts.features.map((f) => ({ ...f, geometry: wound(f.geometry) }));
  const context = (opts.context ?? []).map(wound);
  const fitTo = features.length ? features.map((f) => f.geometry) : context;

  // precision(0): no adaptive resampling — pointless at country scale, and slow
  const projection = geoMercator().precision(0);
  if (fitTo.length) {
    projection.fitExtent(
      [
        [frame.x, frame.y],
        [frame.x + frame.w, frame.y + frame.h],
      ],
      asGeo(fitTo),
    );
  }
  const ctx = new QuantContext(MIN_STEP_PX, MIN_RING_PX);
  const fine = new QuantContext(0.05, 0);
  const path = geoPath(projection, ctx as unknown as CanvasRenderingContext2D);
  const fitKey = `${width}x${height}:${projection.scale()}:${projection.translate().join(",")}`;

  // The same geometry is drawn by several maps of one report with an
  // identical fit: cache the projected path string per (geometry, fit).
  const draw = (g: AreaGeometry): string => {
    const hit = pathCache.get(g);
    if (hit && hit.fitKey === fitKey) return hit.d;
    path(g as GeoPermissibleObjects);
    let d = ctx.result();
    if (!d) {
      // a whole feature below the decimation threshold (tiny urban LGA):
      // draw it undecimated rather than let it vanish from the map
      path.context(fine as unknown as CanvasRenderingContext2D)(g as GeoPermissibleObjects);
      d = fine.result();
      path.context(ctx as unknown as CanvasRenderingContext2D);
    }
    pathCache.set(g, { fitKey, d });
    return d;
  };

  const paths: MapPath[] = [];
  for (const f of features) {
    const d = draw(f.geometry);
    if (d) paths.push({ d, fill: scale.color(f.value), name: f.name });
  }
  const contextPaths = context.map(draw).filter(Boolean);

  return {
    width,
    height,
    title: opts.title,
    subtitle: opts.subtitle ?? null,
    paths,
    context: contextPaths,
    legend: scale.legend,
    legendTitle: opts.legendTitle,
    attribution: MAP_ATTRIBUTION,
    frame,
    legendX: width - legendW - 8,
  };
}

/** content.svgs key → colour scale (legend reconstruction for the PDF). */
export const SVG_KEY_SCALE: Record<string, ScaleKind> = {
  "rain-total": "rain",
  "rain-pct-normal": "pct",
  "tmax-anomaly": "anomaly",
};

export type ParsedMap = {
  width: number;
  height: number;
  paths: { d: string; fill: string }[];
  context: string | null;
};

/**
 * Recover the projected path data from an SVG string produced by
 * renderMapSvg (our own fixed format — not a general SVG parser). This is
 * the shared helper that lets the PDF redraw exactly the web map with
 * react-pdf primitives, from the single source of truth (reports.content).
 */
export function parseMapSvg(svg: string): ParsedMap {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const width = vb ? Number(vb[1]) : 640;
  const height = vb ? Number(vb[2]) : 520;
  const ctx = /<path d="([^"]+)" fill="#efefef"/.exec(svg);
  const paths: { d: string; fill: string }[] = [];
  const re = /<path d="([^"]+)" fill="(#[0-9a-fA-F]{3,6})"><title>/g;
  for (let m = re.exec(svg); m; m = re.exec(svg)) paths.push({ d: m[1], fill: m[2] });
  return { width, height, paths, context: ctx ? ctx[1] : null };
}

export function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const FONT = 'font-family="Helvetica, Arial, sans-serif"';

/**
 * Inline-safe SVG markup: no scripts, no <style>, no ids (several maps can
 * sit on one page), inline fills only. One <path> per feature; the greyed
 * context layer (if any) is a single extra <path>.
 */
export function renderMapSvg(m: MapModel): string {
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" width="${m.width}" height="${m.height}" role="img" aria-label="${escapeXml(m.title)}">`,
  );
  out.push(`<title>${escapeXml(m.title)}</title>`);
  out.push(`<rect x="0" y="0" width="${m.width}" height="${m.height}" fill="#ffffff"/>`);
  out.push(`<text x="12" y="22" ${FONT} font-size="15" font-weight="bold" fill="#111111">${escapeXml(m.title)}</text>`);
  if (m.subtitle) {
    out.push(`<text x="12" y="40" ${FONT} font-size="11" fill="#444444">${escapeXml(m.subtitle)}</text>`);
  }
  if (m.context.length) {
    out.push(`<path d="${m.context.join("")}" fill="#efefef" stroke="#bdbdbd" stroke-width="0.4"/>`);
  }
  out.push(`<g stroke="#ffffff" stroke-width="0.35" stroke-linejoin="round">`);
  for (const p of m.paths) {
    out.push(`<path d="${p.d}" fill="${p.fill}"><title>${escapeXml(p.name)}</title></path>`);
  }
  out.push(`</g>`);
  // legend
  const lx = m.legendX;
  let ly = m.frame.y + 4;
  out.push(`<text x="${lx}" y="${ly}" ${FONT} font-size="11" font-weight="bold" fill="#111111">${escapeXml(m.legendTitle)}</text>`);
  ly += 10;
  for (const item of m.legend) {
    out.push(`<rect x="${lx}" y="${ly}" width="14" height="12" fill="${item.color}" stroke="#999999" stroke-width="0.5"/>`);
    out.push(`<text x="${lx + 20}" y="${ly + 10}" ${FONT} font-size="10" fill="#222222">${escapeXml(item.label)}</text>`);
    ly += 17;
  }
  out.push(
    `<text x="12" y="${m.height - 8}" ${FONT} font-size="9" fill="#555555">${escapeXml(m.attribution)}</text>`,
  );
  out.push(`</svg>`);
  return out.join("");
}
