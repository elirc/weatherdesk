import "server-only";
import { and, asc, eq, gte, lte, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { forecastDaily, normalsMonthly, normalsSeason, observedDaily } from "@/db/schema";

/**
 * Climate / history / farming queries for the place info tabs (A4).
 * Server-only; values come back with source + timestamps for provenance.
 * Place resolution is A3's src/app/(public)/place/resolve.ts (resolvePlace).
 */

// ---------------------------------------------------------------- normals

export type MonthlyNormal = {
  month: number;
  rainMm: number | null;
  rainyDays: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

export type SeasonNormal = {
  onsetDoy: number | null;
  cessationDoy: number | null;
  seasonLengthDays: number | null;
  method: string;
};

export async function getMonthlyNormals(cellId: number): Promise<MonthlyNormal[]> {
  return db
    .select({
      month: normalsMonthly.month,
      rainMm: normalsMonthly.rainMm,
      rainyDays: normalsMonthly.rainyDays,
      tmaxC: normalsMonthly.tmaxC,
      tminC: normalsMonthly.tminC,
    })
    .from(normalsMonthly)
    .where(eq(normalsMonthly.gridCellId, cellId))
    .orderBy(asc(normalsMonthly.month));
}

export async function getSeasonNormal(cellId: number): Promise<SeasonNormal | null> {
  const [row] = await db
    .select({
      onsetDoy: normalsSeason.onsetDoy,
      cessationDoy: normalsSeason.cessationDoy,
      seasonLengthDays: normalsSeason.seasonLengthDays,
      method: normalsSeason.method,
    })
    .from(normalsSeason)
    .where(eq(normalsSeason.gridCellId, cellId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------- observed

export type ObservedDay = {
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  source: string;
  preliminary: boolean;
  updatedAt: Date;
};

/** Observed days in [from, to] ascending. Callers clamp the span (≤ 5 years). */
export async function getObservedRange(cellId: number, from: string, to: string): Promise<ObservedDay[]> {
  return db
    .select({
      date: observedDaily.date,
      rainMm: observedDaily.rainMm,
      tmaxC: observedDaily.tmaxC,
      tminC: observedDaily.tminC,
      humidityPct: observedDaily.humidityPct,
      windKmh: observedDaily.windKmh,
      source: observedDaily.source,
      preliminary: observedDaily.preliminary,
      updatedAt: observedDaily.updatedAt,
    })
    .from(observedDaily)
    .where(and(eq(observedDaily.gridCellId, cellId), gte(observedDaily.date, from), lte(observedDaily.date, to)))
    .orderBy(asc(observedDaily.date));
}

/** Rain-only series for onset detection. */
export async function getRainSeries(
  cellId: number,
  from: string,
  to: string,
): Promise<{ date: string; rainMm: number | null }[]> {
  return db
    .select({ date: observedDaily.date, rainMm: observedDaily.rainMm })
    .from(observedDaily)
    .where(and(eq(observedDaily.gridCellId, cellId), gte(observedDaily.date, from), lte(observedDaily.date, to)))
    .orderBy(asc(observedDaily.date));
}

/** Earliest + latest observed date and newest update for a cell (provenance / picker bounds). */
export async function getObservedBounds(
  cellId: number,
): Promise<{ first: string | null; last: string | null; updatedAt: Date | null }> {
  const [row] = await db
    .select({
      first: sql<string | null>`min(${observedDaily.date})::text`,
      last: sql<string | null>`max(${observedDaily.date})::text`,
      updatedAt: max(observedDaily.updatedAt),
    })
    .from(observedDaily)
    .where(eq(observedDaily.gridCellId, cellId));
  return { first: row?.first ?? null, last: row?.last ?? null, updatedAt: row?.updatedAt ?? null };
}

// ---------------------------------------------------------------- forecast

export type ForecastDay = {
  date: string;
  rainMm: number | null;
  rainProbPct: number | null;
  tmaxC: number | null;
  tminC: number | null;
  source: string;
  fetchedAt: Date;
};

/** forecast_daily rows from `from` (inclusive), at most `days`. */
export async function getForecastDays(cellId: number, from: string, days: number): Promise<ForecastDay[]> {
  return db
    .select({
      date: forecastDaily.date,
      rainMm: forecastDaily.rainMm,
      rainProbPct: forecastDaily.rainProbPct,
      tmaxC: forecastDaily.tmaxC,
      tminC: forecastDaily.tminC,
      source: forecastDaily.source,
      fetchedAt: forecastDaily.fetchedAt,
    })
    .from(forecastDaily)
    .where(and(eq(forecastDaily.gridCellId, cellId), gte(forecastDaily.date, from)))
    .orderBy(asc(forecastDaily.date))
    .limit(Math.max(1, Math.min(16, days)));
}
