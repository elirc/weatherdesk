/**
 * Home-map layer definitions: fixed class breaks, colours, legend labels and
 * the MapLibre fill-color expression. Pure (no React / no maplibre import) so
 * the route handler, the client map and unit tests share one source.
 */

export type MapLayerId = "rain_today" | "tmax_today" | "rain_7d" | "alerts";

export type LayerDef = {
  id: MapLayerId;
  label: string;
  shortLabel: string;
  unit: string;
  /** ascending lower bounds of classes 2..n (class 1 is "below breaks[0]") */
  breaks: number[];
  /** breaks.length + 1 colours, light → strong */
  colors: string[];
  /** colour for LGAs without data */
  noData: string;
  decimals: number;
};

export const NO_DATA_COLOR = "#d4d4d8";

export const LAYER_DEFS: Record<MapLayerId, LayerDef> = {
  rain_today: {
    id: "rain_today",
    label: "Rain today",
    shortLabel: "Rain today",
    unit: "mm",
    breaks: [1, 5, 10, 25, 50],
    colors: ["#f1f5f9", "#c6dbef", "#9ecae1", "#4292c6", "#2171b5", "#08306b"],
    noData: NO_DATA_COLOR,
    decimals: 1,
  },
  tmax_today: {
    id: "tmax_today",
    label: "Max temperature today",
    shortLabel: "Max temp",
    unit: "°C",
    breaks: [27, 30, 33, 36, 40],
    colors: ["#ffffcc", "#ffeda0", "#feb24c", "#fd8d3c", "#e31a1c", "#800026"],
    noData: NO_DATA_COLOR,
    decimals: 1,
  },
  rain_7d: {
    id: "rain_7d",
    label: "Rain next 7 days",
    shortLabel: "Rain 7 days",
    unit: "mm",
    breaks: [5, 20, 50, 100, 200],
    colors: ["#f7fcf0", "#ccebc5", "#7bccc4", "#43a2ca", "#0868ac", "#084081"],
    noData: NO_DATA_COLOR,
    decimals: 0,
  },
  alerts: {
    id: "alerts",
    label: "Active advisories",
    shortLabel: "Advisories",
    unit: "advisories",
    breaks: [1, 2, 3],
    colors: ["#f4f4f5", "#fbbf24", "#f97316", "#dc2626"],
    noData: NO_DATA_COLOR,
    decimals: 0,
  },
};

export const LAYER_IDS: MapLayerId[] = ["rain_today", "tmax_today", "rain_7d", "alerts"];

export function isLayerId(v: string): v is MapLayerId {
  return (LAYER_IDS as string[]).includes(v);
}

/** Class index 0..breaks.length for a value (null → -1). */
export function classify(def: LayerDef, value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return -1;
  let i = 0;
  while (i < def.breaks.length && value >= def.breaks[i]) i++;
  return i;
}

export function colorFor(def: LayerDef, value: number | null | undefined): string {
  const c = classify(def, value);
  return c < 0 ? def.noData : def.colors[c];
}

export function formatLayerValue(def: LayerDef, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "no data";
  if (def.id === "alerts") return value === 1 ? "1 advisory" : `${value} advisories`;
  return `${value.toFixed(def.decimals)} ${def.unit}`;
}

export type LegendItem = { color: string; label: string };

/** Legend rows, e.g. "< 1 mm", "1–5 mm", …, "≥ 50 mm", plus "no data". */
export function legendItems(def: LayerDef): LegendItem[] {
  const u = def.id === "alerts" ? "" : ` ${def.unit}`;
  const items: LegendItem[] = [];
  const b = def.breaks;
  if (def.id === "alerts") {
    items.push({ color: def.colors[0], label: "none" });
    for (let i = 0; i < b.length; i++) {
      const last = i === b.length - 1;
      items.push({ color: def.colors[i + 1], label: last ? `${b[i]}+` : String(b[i]) });
    }
  } else {
    items.push({ color: def.colors[0], label: `< ${b[0]}${u}` });
    for (let i = 0; i < b.length - 1; i++) {
      items.push({ color: def.colors[i + 1], label: `${b[i]}–${b[i + 1]}${u}` });
    }
    items.push({ color: def.colors[b.length], label: `≥ ${b[b.length - 1]}${u}` });
  }
  items.push({ color: def.noData, label: "no data" });
  return items;
}

/**
 * MapLibre `fill-color` expression reading feature property `value`:
 * ["case", ["==", ["get","value"], null], noData, ["step", ["get","value"], c0, b0, c1, …]]
 */
export function fillColorExpression(def: LayerDef): unknown[] {
  const step: unknown[] = ["step", ["to-number", ["get", "value"]], def.colors[0]];
  def.breaks.forEach((b, i) => step.push(b, def.colors[i + 1]));
  return ["case", ["==", ["typeof", ["get", "value"]], "number"], step, def.noData];
}
