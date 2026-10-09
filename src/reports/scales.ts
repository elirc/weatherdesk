import { NORMAL_BANDS } from "@/lib/weather/constants";

/**
 * Binned colour scales for report maps (pure). Shared by the inline SVG
 * renderer and the PDF renderer so web and print match exactly.
 */

export type LegendItem = { color: string; label: string };

export const NO_DATA_COLOR = "#d4d4d4";

type Bin = { max: number; color: string; label: string };

function pick(bins: Bin[], v: number | null): string {
  if (v == null || !Number.isFinite(v)) return NO_DATA_COLOR;
  for (const b of bins) if (v <= b.max) return b.color;
  return bins[bins.length - 1].color;
}

/** Period rainfall total (mm), sequential. A bin includes its upper bound. */
export const RAIN_BINS: Bin[] = [
  { max: 5, color: "#f7fbff", label: "0–5 mm" },
  { max: 10, color: "#deebf7", label: "5–10 mm" },
  { max: 25, color: "#c6dbef", label: "10–25 mm" },
  { max: 50, color: "#9ecae1", label: "25–50 mm" },
  { max: 100, color: "#6baed6", label: "50–100 mm" },
  { max: 200, color: "#3182bd", label: "100–200 mm" },
  { max: Infinity, color: "#08519c", label: "> 200 mm" },
];

/**
 * Percent of normal, diverging around the "near normal" band. Boundaries
 * follow classifyNormalBand exactly: < 80 below, 80–120 near, > 120 above.
 * Percentages are integers (percentOfNormal rounds), so 79 → below and
 * 121 → above.
 */
export const PCT_BINS: Bin[] = [
  { max: 49, color: "#8c510a", label: "< 50%" },
  { max: NORMAL_BANDS.belowPct - 1, color: "#d8b365", label: `50–${NORMAL_BANDS.belowPct - 1}% (below)` },
  { max: NORMAL_BANDS.abovePct, color: "#f5f5f5", label: `${NORMAL_BANDS.belowPct}–${NORMAL_BANDS.abovePct}% (near)` },
  { max: 150, color: "#9ecae1", label: `${NORMAL_BANDS.abovePct + 1}–150% (above)` },
  { max: 200, color: "#4292c6", label: "151–200%" },
  { max: Infinity, color: "#08519c", label: "> 200%" },
];

/** Max-temperature anomaly (°C), diverging blue (cooler) → red (warmer). */
export const ANOMALY_BINS: Bin[] = [
  { max: -2, color: "#2166ac", label: "< -2 °C" },
  { max: -1, color: "#67a9cf", label: "-2 to -1 °C" },
  { max: -0.5, color: "#d1e5f0", label: "-1 to -0.5 °C" },
  { max: 0.5, color: "#f7f7f7", label: "±0.5 °C" },
  { max: 1, color: "#fddbc7", label: "0.5 to 1 °C" },
  { max: 2, color: "#ef8a62", label: "1 to 2 °C" },
  { max: Infinity, color: "#b2182b", label: "> 2 °C" },
];

/** pct bins use integer comparisons: round fractional input first. */
export function pctColor(pct: number | null): string {
  return pick(PCT_BINS, pct == null ? null : Math.round(pct));
}

export function rainColor(mm: number | null): string {
  return pick(RAIN_BINS, mm);
}

export function anomalyColor(c: number | null): string {
  return pick(ANOMALY_BINS, c);
}

export function legendOf(bins: Bin[]): LegendItem[] {
  return [...bins.map((b) => ({ color: b.color, label: b.label })), { color: NO_DATA_COLOR, label: "No data" }];
}

export type ScaleKind = "rain" | "pct" | "anomaly";

export function scaleFor(kind: ScaleKind): { color: (v: number | null) => string; legend: LegendItem[] } {
  if (kind === "rain") return { color: rainColor, legend: legendOf(RAIN_BINS) };
  if (kind === "pct") return { color: pctColor, legend: legendOf(PCT_BINS) };
  return { color: anomalyColor, legend: legendOf(ANOMALY_BINS) };
}
