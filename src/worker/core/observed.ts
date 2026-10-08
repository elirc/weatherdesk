import type { ObservedDay } from "@/adapters/types";
import { addDaysIso } from "@/lib/time";

/**
 * Observed-daily merge rules (pure).
 * - Preliminary rows come from the forecast provider's past_days model
 *   estimate: source 'model_estimate', preliminary true. They never overwrite
 *   a final (non-preliminary) row — enforced in SQL with setWhere.
 * - Final rows come from the history provider (NASA POWER): source
 *   'nasa_power', preliminary false. They replace anything.
 */

export const SOURCE_FINAL = "nasa_power";
export const SOURCE_PRELIMINARY = "model_estimate";

/** NASA POWER publishes with a lag; top up only to today - NASA_LAG_DAYS. */
export const NASA_LAG_DAYS = 2;
/** When a cell has no final data at all, top up at most this far back (backfill covers history). */
export const TOPUP_MAX_DAYS = 30;

export type ObservedRow = {
  gridCellId: number;
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  solarMjM2: number | null;
  source: string;
  preliminary: boolean;
};

/** A day with no rain and no temperature is a provider gap — never store it as data. */
export function hasCoreValues(d: ObservedDay): boolean {
  return d.rainMm != null || d.tmaxC != null || d.tminC != null;
}

export function toObservedRows(
  gridCellId: number,
  days: readonly ObservedDay[],
  kind: "final" | "preliminary",
): ObservedRow[] {
  return days.filter(hasCoreValues).map((d) => ({
    gridCellId,
    date: d.date,
    rainMm: d.rainMm,
    tmaxC: d.tmaxC,
    tminC: d.tminC,
    humidityPct: d.humidityPct,
    windKmh: d.windKmh,
    solarMjM2: d.solarMjM2,
    source: kind === "final" ? SOURCE_FINAL : SOURCE_PRELIMINARY,
    preliminary: kind === "preliminary",
  }));
}

/**
 * NASA top-up range for one cell: from the day after its last final date to
 * today - lag. Null when nothing to fetch.
 */
export function topUpRange(lastFinalDate: string | null, lagosToday: string): { start: string; end: string } | null {
  const end = addDaysIso(lagosToday, -NASA_LAG_DAYS);
  const floor = addDaysIso(lagosToday, -TOPUP_MAX_DAYS);
  let start = lastFinalDate ? addDaysIso(lastFinalDate, 1) : floor;
  if (start < floor) start = floor;
  if (start > end) return null;
  return { start, end };
}
