import { addDaysIso, dateRange } from "@/lib/time";

/**
 * Pure period + normals arithmetic for the report engine (DB-free, unit-tested).
 * All dates are Africa/Lagos civil dates (YYYY-MM-DD).
 */

export type ReportType = "weekly" | "monthly";

/** ISO weekday 1 (Mon) .. 7 (Sun). */
function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Normalise and validate a period start. Weekly periods start on a Monday
 * (any date is snapped back to its Monday); monthly periods start on the 1st.
 * Returns the inclusive [start, end].
 */
export function resolvePeriod(type: ReportType, periodStart: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) throw new Error(`invalid periodStart '${periodStart}'`);
  if (type === "weekly") {
    const start = addDaysIso(periodStart, 1 - isoWeekday(periodStart));
    return { start, end: addDaysIso(start, 6) };
  }
  const y = Number(periodStart.slice(0, 4));
  const m = Number(periodStart.slice(5, 7));
  const start = `${periodStart.slice(0, 7)}-01`;
  return { start, end: `${periodStart.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}

/** Days of the period falling in each calendar month: [{year, month, days, monthDays}]. */
export function monthOverlaps(
  start: string,
  end: string,
): { year: number; month: number; days: number; monthDays: number }[] {
  const out: { year: number; month: number; days: number; monthDays: number }[] = [];
  for (const d of dateRange(start, end)) {
    const year = Number(d.slice(0, 4));
    const month = Number(d.slice(5, 7));
    const last = out[out.length - 1];
    if (last && last.year === year && last.month === month) last.days += 1;
    else out.push({ year, month, days: 1, monthDays: daysInMonth(year, month) });
  }
  return out;
}

/**
 * Pro-rated rainfall normal for an arbitrary period (weekly reports; a full
 * calendar month reduces to that month's normal exactly).
 *
 *   normalRain(period) = Σ over months m overlapping the period of
 *                        normalRain_m × (daysOfPeriodIn_m / daysIn_m)
 *
 * i.e. each monthly normal total is spread evenly over the days of its month
 * and the period collects the share for the days it covers. A week spanning
 * 29 Sep – 5 Oct takes 2/30 of September's normal plus 5/31 of October's.
 * Returns null if any overlapping month has no normal (partial normals would
 * understate the expectation and inflate % of normal).
 */
export function proRatedRainNormal(
  start: string,
  end: string,
  monthlyRainNormal: (month: number) => number | null,
): number | null {
  let total = 0;
  for (const o of monthOverlaps(start, end)) {
    const n = monthlyRainNormal(o.month);
    if (n == null) return null;
    total += n * (o.days / o.monthDays);
  }
  return total;
}

/**
 * Day-weighted mean of monthly temperature normals over the period:
 *   Σ tmax_m × daysOfPeriodIn_m / Σ daysOfPeriodIn_m
 */
export function dayWeightedNormal(
  start: string,
  end: string,
  monthlyNormal: (month: number) => number | null,
): number | null {
  let sum = 0;
  let days = 0;
  for (const o of monthOverlaps(start, end)) {
    const n = monthlyNormal(o.month);
    if (n == null) return null;
    sum += n * o.days;
    days += o.days;
  }
  return days ? sum / days : null;
}

export function round1(v: number | null): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

export function mean(values: (number | null)[]): number | null {
  let s = 0;
  let n = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    s += v;
    n += 1;
  }
  return n ? s / n : null;
}

/** Next calendar month (1..12) after `month`. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
