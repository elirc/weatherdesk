import { NORMALS_END_YEAR, NORMALS_START_YEAR } from "@/lib/weather/constants";
import { detectCessation, detectOnset, isRainyDay, type DailyRain } from "@/lib/weather/calc";
import { dayOfYear } from "@/lib/time";

/**
 * Climate normals from observed daily data (pure).
 * normals_monthly: 1991–2020 only; a year-month counts when ≥ 80% of its
 * days have rain data. Values = mean over qualifying years of the monthly
 * rain total, rainy-day count, and mean tmax/tmin.
 * normals_season: median onset / cessation DOY over years with a detected
 * onset (calc.ts agronomic definition), preferring 1991–2020.
 */

export type NormalDay = { date: string; rainMm: number | null; tmaxC: number | null; tminC: number | null };

export type MonthlyNormal = {
  month: number;
  rainMm: number | null;
  rainyDays: number | null;
  tmaxC: number | null;
  tminC: number | null;
  nYears: number;
};

export const MIN_MONTH_COVERAGE = 0.8;
export const MIN_SEASON_YEARS = 5;
/** Onset search start each year (avoids treating stray harmattan showers as onset). */
export const ONSET_SEARCH_MMDD = "02-01";

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function computeMonthlyNormals(days: readonly NormalDay[]): MonthlyNormal[] {
  // year-month buckets within the normals period
  const ym = new Map<string, NormalDay[]>();
  for (const d of days) {
    const y = Number(d.date.slice(0, 4));
    if (y < NORMALS_START_YEAR || y > NORMALS_END_YEAR) continue;
    const k = d.date.slice(0, 7);
    const arr = ym.get(k);
    if (arr) arr.push(d);
    else ym.set(k, [d]);
  }
  const perMonth = new Map<number, { rain: number[]; rainy: number[]; tmax: number[]; tmin: number[] }>();
  for (const [k, list] of ym) {
    const y = Number(k.slice(0, 4));
    const m = Number(k.slice(5, 7));
    const withRain = list.filter((d) => d.rainMm != null);
    if (withRain.length < MIN_MONTH_COVERAGE * daysInMonth(y, m)) continue;
    let acc = perMonth.get(m);
    if (!acc) {
      acc = { rain: [], rainy: [], tmax: [], tmin: [] };
      perMonth.set(m, acc);
    }
    acc.rain.push(withRain.reduce((s, d) => s + (d.rainMm ?? 0), 0));
    acc.rainy.push(withRain.filter((d) => isRainyDay(d.rainMm)).length);
    const tx = list.filter((d) => d.tmaxC != null).map((d) => d.tmaxC as number);
    const tn = list.filter((d) => d.tminC != null).map((d) => d.tminC as number);
    if (tx.length) acc.tmax.push(tx.reduce((a, b) => a + b, 0) / tx.length);
    if (tn.length) acc.tmin.push(tn.reduce((a, b) => a + b, 0) / tn.length);
  }
  const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const out: MonthlyNormal[] = [];
  for (let m = 1; m <= 12; m++) {
    const acc = perMonth.get(m);
    if (!acc) continue;
    out.push({
      month: m,
      rainMm: mean(acc.rain),
      rainyDays: mean(acc.rainy),
      tmaxC: mean(acc.tmax),
      tminC: mean(acc.tmin),
      nYears: acc.rain.length,
    });
  }
  return out;
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export type SeasonNormal = {
  onsetDoy: number | null;
  cessationDoy: number | null;
  seasonLengthDays: number | null;
  nYears: number;
};

/** Per-year onset/cessation DOY. */
export function seasonByYear(days: readonly DailyRain[]): { year: number; onsetDoy: number | null; cessationDoy: number | null }[] {
  const byYear = new Map<number, DailyRain[]>();
  for (const d of days) {
    const y = Number(d.date.slice(0, 4));
    const arr = byYear.get(y);
    if (arr) arr.push(d);
    else byYear.set(y, [d]);
  }
  const out: { year: number; onsetDoy: number | null; cessationDoy: number | null }[] = [];
  for (const [year, list] of [...byYear].sort((a, b) => a[0] - b[0])) {
    // need a mostly complete year to say anything about the season
    if (list.length < 300) continue;
    const series = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const onset = detectOnset(series, `${year}-${ONSET_SEARCH_MMDD}`);
    const cess = onset ? detectCessation(series, onset) : null;
    out.push({ year, onsetDoy: onset ? dayOfYear(onset) : null, cessationDoy: cess ? dayOfYear(cess) : null });
  }
  return out;
}

export function computeSeasonNormal(days: readonly DailyRain[]): SeasonNormal {
  const years = seasonByYear(days);
  const inPeriod = years.filter((y) => y.year >= NORMALS_START_YEAR && y.year <= NORMALS_END_YEAR);
  const use = inPeriod.filter((y) => y.onsetDoy != null).length >= MIN_SEASON_YEARS ? inPeriod : years;
  const onsets = use.filter((y) => y.onsetDoy != null).map((y) => y.onsetDoy as number);
  const cessations = use.filter((y) => y.cessationDoy != null).map((y) => y.cessationDoy as number);
  const onsetDoy = median(onsets);
  const cessationDoy = median(cessations);
  return {
    onsetDoy,
    cessationDoy,
    seasonLengthDays: onsetDoy != null && cessationDoy != null && cessationDoy > onsetDoy ? cessationDoy - onsetDoy : null,
    nYears: onsets.length,
  };
}
