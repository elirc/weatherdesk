import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { forecastDaily, forecastHourly } from "@/db/schema";
import { getForecastAdapter } from "@/adapters";
import type { ForecastResult } from "@/adapters/types";
import { JOBS, sendJob } from "@/lib/queue";
import { activeCells, loadCells, type CellLite } from "../cells";
import { budgetAllows } from "../budget";
import { chunk, chunkKey } from "../core/chunk";
import { excludedSet, inSlices } from "../db-util";
import { log } from "../log";

/** Retry policy for provider fan-out jobs (pg-boss send options). */
export const PROVIDER_RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true, retryDelayMax: 900 } as const;

/** forecast.refresh — chunk all active cells and fan out fetch jobs. */
export async function forecastRefresh(): Promise<{ cells: number; chunks: number; queued: number }> {
  const adapter = getForecastAdapter();
  const cells = await activeCells();
  const chunks = chunk(
    cells.map((c) => c.id),
    Math.max(1, adapter.maxPointsPerCall),
  );
  let queued = 0;
  for (const ids of chunks) {
    const id = await sendJob(JOBS.forecastFetchChunk, { gridCellIds: ids }, { ...PROVIDER_RETRY, singletonKey: chunkKey(ids) });
    if (id) queued += 1;
  }
  log.info("forecast.refresh fanned out", { cells: cells.length, chunks: chunks.length, queued, adapter: adapter.name });
  return { cells: cells.length, chunks: chunks.length, queued };
}

/** forecast.fetch-chunk — fetch + store one chunk. Throws on provider failure so pg-boss retries. */
export async function forecastFetchChunk(data: { gridCellIds: number[] }): Promise<{ stored: number; skipped?: string }> {
  const cells = await loadCells(data.gridCellIds);
  return fetchAndStoreForecast(cells);
}

export async function fetchAndStoreForecast(cells: CellLite[]): Promise<{ stored: number; skipped?: string }> {
  if (!cells.length) return { stored: 0 };
  const adapter = getForecastAdapter();
  if (!(await budgetAllows(adapter.name, cells.length, `forecast fetch for ${cells.length} cells`))) {
    return { stored: 0, skipped: "budget" };
  }
  let stored = 0;
  for (const part of chunk(cells, Math.max(1, adapter.maxPointsPerCall))) {
    const results = await adapter.fetchForecast(part.map((c) => ({ lat: c.lat, lon: c.lon })));
    for (let i = 0; i < part.length; i++) {
      const r = results[i];
      if (r) stored += await storeForecast(part[i].id, r);
    }
  }
  return { stored };
}

/**
 * Upsert one cell's forecast run and drop rows from older runs, so the
 * tables only ever hold the latest run (with its provenance).
 */
export async function storeForecast(gridCellId: number, r: ForecastResult): Promise<number> {
  const { source, fetchedAt } = r;
  const hourly = r.hourly.map((h) => ({ gridCellId, ...h, source, fetchedAt }));
  const daily = r.daily.map((d) => ({ gridCellId, ...d, source, fetchedAt }));
  // Keep stale data untouched when the provider returned nothing useful.
  if (!hourly.length && !daily.length) return 0;

  await db.transaction(async (tx) => {
    if (hourly.length) {
      await inSlices(hourly, 1000, (slice) =>
        tx
          .insert(forecastHourly)
          .values(slice)
          .onConflictDoUpdate({
            target: [forecastHourly.gridCellId, forecastHourly.validTime],
            set: excludedSet(forecastHourly, ["gridCellId", "validTime"]),
          }),
      );
      await tx
        .delete(forecastHourly)
        .where(and(inArray(forecastHourly.gridCellId, [gridCellId]), lt(forecastHourly.fetchedAt, fetchedAt)));
    }
    if (daily.length) {
      await inSlices(daily, 1000, (slice) =>
        tx
          .insert(forecastDaily)
          .values(slice)
          .onConflictDoUpdate({
            target: [forecastDaily.gridCellId, forecastDaily.date],
            set: excludedSet(forecastDaily, ["gridCellId", "date"]),
          }),
      );
      await tx
        .delete(forecastDaily)
        .where(and(inArray(forecastDaily.gridCellId, [gridCellId]), lt(forecastDaily.fetchedAt, fetchedAt)));
    }
  });
  return hourly.length + daily.length;
}
