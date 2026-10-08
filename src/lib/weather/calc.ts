import { NORMAL_BANDS, RAINY_DAY_MM } from "./constants";

/**
 * Shared, pure weather calculations. Used by the pipeline (alerts, accuracy),
 * the reports engine (weekly/monthly numbers) and the public site
 * (month-so-far, farming summary). Unit-tested in tests/unit/weather.
 * All functions are deterministic and DB-free.
 */

export type DailyRain = { date: string; rainMm: number | null };

/** value as a percentage of normal (100 = exactly normal). null-safe. */
export function percentOfNormal(actual: number | null, normal: number | null): number | null {
  if (actual == null || normal == null) return null;
  if (normal <= 0) return actual > 0 ? 999 : 100;
  return Math.round((actual / normal) * 100);
}

export type NormalBand = "above normal" | "near normal" | "below normal";

export function classifyNormalBand(pct: number | null): NormalBand | null {
  if (pct == null) return null;
  if (pct < NORMAL_BANDS.belowPct) return "below normal";
  if (pct > NORMAL_BANDS.abovePct) return "above normal";
  return "near normal";
}

export function isRainyDay(rainMm: number | null): boolean {
  return rainMm != null && rainMm >= RAINY_DAY_MM;
}

export type DrySpell = { start: string; end: string; days: number };

/** All dry spells (runs of consecutive non-rainy days) of at least minDays. */
export function detectDrySpells(series: DailyRain[], minDays: number): DrySpell[] {
  const spells: DrySpell[] = [];
  let runStart: string | null = null;
  let runLen = 0;
  const flush = (endDate: string | null) => {
    if (runStart && runLen >= minDays && endDate) {
      spells.push({ start: runStart, end: endDate, days: runLen });
    }
  };
  let prevDate: string | null = null;
  for (const d of series) {
    if (!isRainyDay(d.rainMm)) {
      if (!runStart) {
        runStart = d.date;
        runLen = 1;
      } else {
        runLen += 1;
      }
    } else {
      flush(prevDate);
      runStart = null;
      runLen = 0;
    }
    prevDate = d.date;
  }
  flush(prevDate);
  return spells;
}

/** Length of the dry run ending at the LAST day of the series (0 if it rained). */
export function trailingDryDays(series: DailyRain[]): number {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (isRainyDay(series[i].rainMm)) break;
    n += 1;
  }
  return n;
}

/**
 * Rainy-season onset (agronomic definition, documented on the About page):
 * the first day from searchStart where ≥ ONSET_WINDOW_MM falls within
 * ONSET_WINDOW_DAYS days, and the following FALSE_START_SCAN_DAYS days do not
 * contain a dry spell of FALSE_START_DRY_DAYS or more.
 * Returns the ISO date, or null when no onset is found.
 */
export const ONSET_WINDOW_MM = 20;
export const ONSET_WINDOW_DAYS = 3;
export const FALSE_START_SCAN_DAYS = 30;
export const FALSE_START_DRY_DAYS = 10;

export function detectOnset(series: DailyRain[], searchStartDate: string): string | null {
  const idx0 = series.findIndex((d) => d.date >= searchStartDate);
  if (idx0 < 0) return null;
  for (let i = idx0; i < series.length - ONSET_WINDOW_DAYS + 1; i++) {
    let windowSum = 0;
    for (let j = 0; j < ONSET_WINDOW_DAYS; j++) windowSum += series[i + j].rainMm ?? 0;
    if (windowSum < ONSET_WINDOW_MM) continue;
    // false-start check
    const scan = series.slice(
      i + ONSET_WINDOW_DAYS,
      i + ONSET_WINDOW_DAYS + FALSE_START_SCAN_DAYS,
    );
    const hasKillerDrySpell = detectDrySpells(scan, FALSE_START_DRY_DAYS).length > 0;
    if (!hasKillerDrySpell) return series[i].date;
  }
  return null;
}

/**
 * Season cessation: the last day at or after searchStart with a rainy day
 * followed by no further ONSET_WINDOW_MM/ONSET_WINDOW_DAYS event in the rest
 * of the series. Simplified: the last date of the final 3-day ≥20mm event.
 */
export function detectCessation(series: DailyRain[], searchStartDate: string): string | null {
  let last: string | null = null;
  const idx0 = series.findIndex((d) => d.date >= searchStartDate);
  if (idx0 < 0) return null;
  for (let i = idx0; i < series.length - ONSET_WINDOW_DAYS + 1; i++) {
    let windowSum = 0;
    for (let j = 0; j < ONSET_WINDOW_DAYS; j++) windowSum += series[i + j].rainMm ?? 0;
    if (windowSum >= ONSET_WINDOW_MM) last = series[i + ONSET_WINDOW_DAYS - 1].date;
  }
  return last;
}

/** Aggregates for "this month so far" and report tables. */
export type PeriodStats = {
  rainTotalMm: number;
  rainyDays: number;
  meanTmaxC: number | null;
  meanTminC: number | null;
  maxTmaxC: number | null;
  maxRainDayMm: number | null;
  nDays: number;
  nMissing: number;
};

export function periodStats(
  days: { rainMm: number | null; tmaxC: number | null; tminC: number | null }[],
): PeriodStats {
  let rain = 0;
  let rainy = 0;
  let tmaxSum = 0;
  let tmaxN = 0;
  let tminSum = 0;
  let tminN = 0;
  let maxTmax: number | null = null;
  let maxRain: number | null = null;
  let missing = 0;
  for (const d of days) {
    if (d.rainMm == null && d.tmaxC == null) missing += 1;
    if (d.rainMm != null) {
      rain += d.rainMm;
      if (d.rainMm >= RAINY_DAY_MM) rainy += 1;
      if (maxRain == null || d.rainMm > maxRain) maxRain = d.rainMm;
    }
    if (d.tmaxC != null) {
      tmaxSum += d.tmaxC;
      tmaxN += 1;
      if (maxTmax == null || d.tmaxC > maxTmax) maxTmax = d.tmaxC;
    }
    if (d.tminC != null) {
      tminSum += d.tminC;
      tminN += 1;
    }
  }
  return {
    rainTotalMm: Math.round(rain * 10) / 10,
    rainyDays: rainy,
    meanTmaxC: tmaxN ? Math.round((tmaxSum / tmaxN) * 10) / 10 : null,
    meanTminC: tminN ? Math.round((tminSum / tminN) * 10) / 10 : null,
    maxTmaxC: maxTmax,
    maxRainDayMm: maxRain,
    nDays: days.length,
    nMissing: missing,
  };
}

/** Accuracy: mean absolute error, null-safe. */
export function meanAbsError(pairs: { forecast: number | null; observed: number | null }[]): {
  mae: number | null;
  n: number;
} {
  let sum = 0;
  let n = 0;
  for (const p of pairs) {
    if (p.forecast == null || p.observed == null) continue;
    sum += Math.abs(p.forecast - p.observed);
    n += 1;
  }
  return { mae: n ? Math.round((sum / n) * 100) / 100 : null, n };
}

/**
 * Accuracy: share of rain / no-rain calls that verified.
 * A "rain" call is rainProbPct ≥ callThresholdPct; it verifies when the
 * observed day was rainy (≥ RAINY_DAY_MM). A "no rain" call verifies when dry.
 */
export function rainHitRate(
  pairs: { rainProbPct: number | null; observedRainMm: number | null }[],
  callThresholdPct: number,
): { hitRate: number | null; n: number } {
  let hits = 0;
  let n = 0;
  for (const p of pairs) {
    if (p.rainProbPct == null || p.observedRainMm == null) continue;
    const calledRain = p.rainProbPct >= callThresholdPct;
    const wasRain = p.observedRainMm >= RAINY_DAY_MM;
    if (calledRain === wasRain) hits += 1;
    n += 1;
  }
  return { hitRate: n ? Math.round((hits / n) * 1000) / 1000 : null, n };
}
