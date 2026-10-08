/**
 * Minimal RFC-4180-ish CSV parser (quoted fields, "" escapes, CRLF/LF).
 * Enough for the settlements fixture and a GRID3 export; no dependency.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body
    .filter((r) => !r[0]?.trim().startsWith("#"))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export type SettlementRow = { name: string; state: string; lat: number; lon: number; kind: string | null };

/** Validate/convert parsed rows; returns good rows plus human-readable rejects. */
export function toSettlementRows(records: Record<string, string>[]): {
  rows: SettlementRow[];
  rejects: string[];
} {
  const rows: SettlementRow[] = [];
  const rejects: string[] = [];
  records.forEach((r, i) => {
    // Number("") is 0 — blank coordinates must be rejected, not placed at 0,0
    const lat = r.lat ? Number(r.lat) : NaN;
    const lon = r.lon ? Number(r.lon) : NaN;
    if (!r.name || !r.state || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      rejects.push(`line ${i + 2}: ${JSON.stringify(r)}`);
      return;
    }
    rows.push({ name: r.name, state: r.state, lat, lon, kind: r.kind || null });
  });
  return { rows, rejects };
}
