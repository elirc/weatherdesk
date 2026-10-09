import {
  classifyNormalBand,
  percentOfNormal,
  periodStats,
  type NormalBand,
} from "@/lib/weather/calc";
import { daysInMonth } from "./doy";

/**
 * "This month so far" (pure). Observed days of the current Lagos month are
 * compared with the 1991–2020 monthly normal PRO-RATED to the same number of
 * days:
 *
 *   normalToDate = monthlyNormal × (daysCovered / daysInMonth)
 *
 * daysCovered = days from the 1st up to and including the latest observed
 * date (a missing day inside that span still counts as covered — it is
 * reported via nMissing rather than silently shrinking the comparison).
 * The same factor pro-rates the normal rainy-day count. The tmax anomaly
 * compares the mean observed tmax with the monthly-normal mean tmax (a mean
 * needs no pro-rating).
 */

export type MonthSoFarDay = {
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  source: string;
  preliminary: boolean;
};

export type MonthlyNormalRow = {
  rainMm: number | null;
  rainyDays: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

export type MonthSoFar = {
  /** YYYY-MM */
  month: string;
  daysInMonth: number;
  daysCovered: number;
  lastDate: string | null;
  nMissing: number;
  rainTotalMm: number;
  normalToDateMm: number | null;
  rainPctOfNormal: number | null;
  band: NormalBand | null;
  rainyDays: number;
  normalRainyDaysToDate: number | null;
  meanTmaxC: number | null;
  normalTmaxC: number | null;
  tmaxAnomalyC: number | null;
  /** any day in the span is preliminary (model estimate awaiting NASA POWER) */
  preliminary: boolean;
  /** distinct sources in the span, e.g. ['nasa_power', 'model_estimate'] */
  sources: string[];
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Pro-rating factor for `daysCovered` days of a month. */
export function proRateFactor(daysCovered: number, monthDays: number): number {
  if (monthDays <= 0) return 0;
  return Math.min(1, Math.max(0, daysCovered / monthDays));
}

/** Monthly normal pro-rated to daysCovered (null-safe, 1 dp). */
export function proRate(normal: number | null, daysCovered: number, monthDays: number): number | null {
  if (normal == null) return null;
  return round1(normal * proRateFactor(daysCovered, monthDays));
}

export function computeMonthSoFar(
  month: string,
  days: readonly MonthSoFarDay[],
  normal: MonthlyNormalRow | null,
): MonthSoFar {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const dim = daysInMonth(year, m);
  const inMonth = days
    .filter((d) => d.date.startsWith(month))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = inMonth.length ? inMonth[inMonth.length - 1].date : null;
  const daysCovered = lastDate ? Number(lastDate.slice(8, 10)) : 0;
  const stats = periodStats(inMonth);
  const nMissing = daysCovered - inMonth.length + stats.nMissing;

  const normalToDateMm = daysCovered ? proRate(normal?.rainMm ?? null, daysCovered, dim) : null;
  const pct = daysCovered ? percentOfNormal(stats.rainTotalMm, normalToDateMm) : null;
  const normalTmaxC = normal?.tmaxC ?? null;
  const tmaxAnomalyC =
    stats.meanTmaxC != null && normalTmaxC != null ? round1(stats.meanTmaxC - normalTmaxC) : null;

  return {
    month,
    daysInMonth: dim,
    daysCovered,
    lastDate,
    nMissing,
    rainTotalMm: stats.rainTotalMm,
    normalToDateMm,
    rainPctOfNormal: pct,
    band: classifyNormalBand(pct),
    rainyDays: stats.rainyDays,
    normalRainyDaysToDate: daysCovered
      ? proRate(normal?.rainyDays ?? null, daysCovered, dim)
      : null,
    meanTmaxC: stats.meanTmaxC,
    normalTmaxC,
    tmaxAnomalyC,
    preliminary: inMonth.some((d) => d.preliminary),
    sources: [...new Set(inMonth.map((d) => d.source))],
  };
}

/** "+1.2 °C" / "−0.4 °C" / "0.0 °C" */
export function formatAnomalyC(v: number | null): string {
  if (v == null) return "—";
  if (v > 0) return `+${v.toFixed(1)} °C`;
  if (v < 0) return `−${Math.abs(v).toFixed(1)} °C`;
  return "0.0 °C";
}
