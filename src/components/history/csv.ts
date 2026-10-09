/**
 * History CSV formatting (pure). RFC 4180: CRLF line endings, fields
 * containing comma, quote or newline are quoted with doubled quotes.
 * Numbers are written plainly (null → empty). Every row carries its source
 * and preliminary flag (provenance rule).
 */

export const HISTORY_CSV_COLUMNS = [
  "date",
  "rain_mm",
  "tmax_c",
  "tmin_c",
  "humidity_pct",
  "wind_kmh",
  "source",
  "preliminary",
] as const;

export type HistoryCsvRow = {
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  source: string;
  preliminary: boolean;
};

export function csvField(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  // neutralise spreadsheet formula injection for text cells
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(fields: readonly (string | number | boolean | null | undefined)[]): string {
  return `${fields.map(csvField).join(",")}\r\n`;
}

export function historyCsvHeader(): string {
  return csvLine(HISTORY_CSV_COLUMNS);
}

export function historyCsvRow(r: HistoryCsvRow): string {
  return csvLine([
    r.date,
    r.rainMm,
    r.tmaxC,
    r.tminC,
    r.humidityPct,
    r.windKmh,
    r.source,
    r.preliminary,
  ]);
}

/** Download filename, e.g. weatherdesk-history-cell431-2025-10-08_2026-10-07.csv */
export function historyCsvFilename(cellId: number, from: string, to: string): string {
  return `weatherdesk-history-cell${cellId}-${from}_${to}.csv`;
}
