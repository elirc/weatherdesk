import { dayOfYear, syntheticObserved } from "@/adapters/mock/climate";
import { detectCessation, detectOnset, isRainyDay, type DailyRain } from "@/lib/weather/calc";
import { NORMALS_END_YEAR, NORMALS_START_YEAR } from "@/lib/weather/constants";

/**
 * Mock-mode climate normals from the deterministic synthetic climate
 * (pure, DB-free; unit-tested). The real pipeline (A2 worker) computes the
 * same aggregates from NASA POWER history.
 */

/** Minimum number of years with a detected onset for a season normal. */
export const MIN_SEASON_YEARS = 10;

/** Median of day-of-year values; even counts → rounded mean of the middle pair. null when empty. */
export function medianDoy(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Onset search start: 1 Feb in the south, 1 Apr where lat ≥ 9°N. */
export function onsetSearchStart(lat: number, year: number): string {
  return lat >= 9 ? `${year}-04-01` : `${year}-02-01`;
}

export function cessationSearchStart(year: number): string {
  return `${year}-09-01`;
}

export type MonthlyNormal = {
  month: number;
  rainMm: number;
  rainyDays: number;
  tmaxC: number;
  tminC: number;
};

export type SeasonNormal = {
  onsetDoy: number | null;
  cessationDoy: number | null;
  seasonLengthDays: number | null;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Monthly normals + season normal for one grid cell over startYear..endYear,
 * from syntheticObserved(lat, lon, date). ~11k cheap calls per cell.
 */
export function computeCellNormals(
  lat: number,
  lon: number,
  startYear: number = NORMALS_START_YEAR,
  endYear: number = NORMALS_END_YEAR,
): { monthly: MonthlyNormal[]; season: SeasonNormal } {
  const nYears = endYear - startYear + 1;
  const rain = new Array<number>(12).fill(0);
  const rainy = new Array<number>(12).fill(0);
  const tmax = new Array<number>(12).fill(0);
  const tmin = new Array<number>(12).fill(0);
  const nDays = new Array<number>(12).fill(0);
  const onsets: number[] = [];
  const cessations: number[] = [];

  for (let y = startYear; y <= endYear; y++) {
    const series: DailyRain[] = [];
    for (let m = 1; m <= 12; m++) {
      const dim = daysInMonth(y, m);
      for (let d = 1; d <= dim; d++) {
        const date = `${y}-${pad2(m)}-${pad2(d)}`;
        const day = syntheticObserved(lat, lon, date);
        const i = m - 1;
        rain[i] += day.rainMm;
        if (isRainyDay(day.rainMm)) rainy[i] += 1;
        tmax[i] += day.tmaxC;
        tmin[i] += day.tminC;
        nDays[i] += 1;
        series.push({ date, rainMm: day.rainMm });
      }
    }
    const onset = detectOnset(series, onsetSearchStart(lat, y));
    if (onset) onsets.push(dayOfYear(onset));
    const cessation = detectCessation(series, cessationSearchStart(y));
    if (cessation) cessations.push(dayOfYear(cessation));
  }

  const monthly: MonthlyNormal[] = rain.map((_, i) => ({
    month: i + 1,
    rainMm: r1(rain[i] / nYears),
    rainyDays: r1(rainy[i] / nYears),
    tmaxC: r1(tmax[i] / nDays[i]),
    tminC: r1(tmin[i] / nDays[i]),
  }));

  const onsetDoy = onsets.length >= MIN_SEASON_YEARS ? medianDoy(onsets) : null;
  const cessationDoy = cessations.length >= MIN_SEASON_YEARS ? medianDoy(cessations) : null;
  const seasonLengthDays =
    onsetDoy != null && cessationDoy != null && cessationDoy > onsetDoy
      ? cessationDoy - onsetDoy
      : null;

  return { monthly, season: { onsetDoy, cessationDoy, seasonLengthDays } };
}
