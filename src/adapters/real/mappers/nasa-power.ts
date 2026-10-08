/**
 * NASA POWER daily point response mapping (pure).
 *
 * Docs (verified 2026-10-08):
 *   https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 *
 * Facts relied on:
 * - GET https://power.larc.nasa.gov/api/temporal/daily/point
 *   ?parameters=..&community=AG&longitude=..&latitude=..&start=YYYYMMDD&end=YYYYMMDD&format=JSON
 * - ≤ 20 parameters per point request; data from 1981-01-01 to near real time.
 * - Values at properties.parameter.<PARAM>["YYYYMMDD"]; fill value in
 *   header.fill_value (-999.0) — recent days lag and come back as fills.
 * - AG community units: PRECTOTCORR mm/day, T2M_MAX/T2M_MIN °C, RH2M %,
 *   WS2M m/s (→ km/h here), ALLSKY_SFC_SW_DWN MJ/m^2/day (no conversion).
 */

import type { LatLon, ObservedDay } from "../../types";

export const NASA_POWER_DAILY_POINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const NASA_PARAMS = ["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN"] as const;
export const NASA_FILL = -999;

export type NasaPowerBody = {
  properties?: { parameter?: Record<string, Record<string, number> | undefined> };
  header?: { fill_value?: number };
  parameters?: Record<string, { units?: string }>;
  messages?: string[];
};

const compact = (d: string) => d.replaceAll("-", "");
const expand = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function buildNasaUrl(point: LatLon, startDate: string, endDate: string): string {
  const p = new URLSearchParams({
    parameters: NASA_PARAMS.join(","),
    community: "AG",
    longitude: point.lon.toFixed(4),
    latitude: point.lat.toFixed(4),
    start: compact(startDate),
    end: compact(endDate),
    format: "JSON",
  });
  return `${NASA_POWER_DAILY_POINT}?${p.toString()}`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function mapNasaPower(body: NasaPowerBody): ObservedDay[] {
  const params = body.properties?.parameter;
  if (!params) throw new Error(`nasa-power: response has no properties.parameter (${(body.messages ?? []).join("; ")})`);
  const fill = body.header?.fill_value ?? NASA_FILL;
  const isFill = (v: number | undefined) => v == null || Number.isNaN(v) || v === fill || v <= NASA_FILL;
  const get = (p: string, k: string): number | null => {
    const v = params[p]?.[k];
    return isFill(v) ? null : (v as number);
  };
  // union of all date keys so a missing parameter does not drop a day
  const keys = new Set<string>();
  for (const p of NASA_PARAMS) for (const k of Object.keys(params[p] ?? {})) keys.add(k);
  return [...keys]
    .filter((k) => /^\d{8}$/.test(k))
    .sort()
    .map((k) => {
      const ws = get("WS2M", k);
      return {
        date: expand(k),
        rainMm: get("PRECTOTCORR", k),
        tmaxC: get("T2M_MAX", k),
        tminC: get("T2M_MIN", k),
        humidityPct: get("RH2M", k),
        windKmh: ws == null ? null : r2(ws * 3.6),
        solarMjM2: get("ALLSKY_SFC_SW_DWN", k),
      };
    });
}
