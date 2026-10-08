import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { observedDaily } from "@/db/schema";
import { getForecastAdapter, getHistoryAdapter } from "@/adapters";
import { addDaysIso } from "@/lib/time";
import { sleep } from "@/adapters/real/http";
import type { CellLite } from "../cells";
import { budgetAllows } from "../budget";
import { chunk } from "../core/chunk";
import { toObservedRows, topUpRange, type ObservedRow } from "../core/observed";
import { excludedSet, inSlices } from "../db-util";
import { errMessage, log } from "../log";

/** Pause between history-provider calls in real mode (NASA asks for gentle use). */
export const HISTORY_THROTTLE_MS = 200;
/** Abort a top-up/backfill loop after this many consecutive provider failures. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Final rows replace anything (NASA POWER is the record of truth). */
export async function upsertFinal(rows: ObservedRow[]): Promise<void> {
  const now = new Date();
  await inSlices(rows, 1000, (slice) =>
    db
      .insert(observedDaily)
      .values(slice.map((r) => ({ ...r, updatedAt: now })))
      .onConflictDoUpdate({
        target: [observedDaily.gridCellId, observedDaily.date],
        set: excludedSet(observedDaily, ["gridCellId", "date"]),
      }),
  );
}

/** Preliminary rows never overwrite a final (non-preliminary) row. */
export async function upsertPreliminary(rows: ObservedRow[]): Promise<void> {
  const now = new Date();
  await inSlices(rows, 1000, (slice) =>
    db
      .insert(observedDaily)
      .values(slice.map((r) => ({ ...r, updatedAt: now })))
      .onConflictDoUpdate({
        target: [observedDaily.gridCellId, observedDaily.date],
        set: excludedSet(observedDaily, ["gridCellId", "date"]),
        setWhere: sql`${observedDaily.preliminary} = true`,
      }),
  );
}

/** (b) preliminary observed from the forecast provider's past_days model estimate. */
export async function storeRecentObserved(cells: CellLite[], days = 7): Promise<{ rows: number; skipped?: string }> {
  const adapter = getForecastAdapter();
  let rows = 0;
  for (const part of chunk(cells, Math.max(1, adapter.maxPointsPerCall))) {
    if (!(await budgetAllows(adapter.name, part.length, "recent daily (preliminary observed)"))) {
      return { rows, skipped: "budget" };
    }
    const results = await adapter.fetchRecentDaily(
      part.map((c) => ({ lat: c.lat, lon: c.lon })),
      days,
    );
    const out: ObservedRow[] = [];
    results.forEach((r, i) => out.push(...toObservedRows(part[i].id, r.days, "preliminary")));
    await upsertPreliminary(out);
    rows += out.length;
  }
  return { rows };
}

/** Last final (non-preliminary) observed date per cell. */
export async function lastFinalDates(cellIds: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  for (const ids of chunk(cellIds, 1000)) {
    const rows = await db
      .select({ id: observedDaily.gridCellId, last: max(observedDaily.date) })
      .from(observedDaily)
      .where(and(inArray(observedDaily.gridCellId, ids), eq(observedDaily.preliminary, false)))
      .groupBy(observedDaily.gridCellId);
    for (const r of rows) if (r.last) m.set(r.id, r.last);
  }
  return m;
}

/**
 * (c) NASA top-up: per cell, fetch from the day after its last final date to
 * today-2 and replace preliminary rows. Returns the set of newly finalised dates.
 */
export async function nasaTopUp(cells: CellLite[], lagosToday: string): Promise<{ finalised: Set<string>; cells: number; failures: number }> {
  const history = getHistoryAdapter();
  const throttle = history.name === "mock" ? 0 : HISTORY_THROTTLE_MS;
  const last = await lastFinalDates(cells.map((c) => c.id));
  const finalised = new Set<string>();
  let failures = 0;
  let consecutive = 0;
  let done = 0;
  for (const cell of cells) {
    const range = topUpRange(last.get(cell.id) ?? null, lagosToday);
    if (!range) continue;
    if (!(await budgetAllows(history.name, 1, "NASA top-up"))) break;
    try {
      const days = await history.fetchDaily({ lat: cell.lat, lon: cell.lon }, range.start, range.end);
      const rows = toObservedRows(cell.id, days, "final");
      await upsertFinal(rows);
      for (const r of rows) finalised.add(r.date);
      consecutive = 0;
      done += 1;
    } catch (e) {
      failures += 1;
      consecutive += 1;
      log.warn("NASA top-up failed for cell (stale data kept)", { cell: cell.id, error: errMessage(e) });
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
        log.error("NASA top-up aborted after consecutive failures", { consecutive });
        throw new Error(`NASA top-up aborted after ${consecutive} consecutive failures: ${errMessage(e)}`);
      }
    }
    if (throttle) await sleep(throttle);
  }
  return { finalised, cells: done, failures };
}

/** Year-chunked history fetch for one cell (backfill). */
export async function backfillCell(cell: CellLite, ranges: { start: string; end: string }[]): Promise<number> {
  const history = getHistoryAdapter();
  const throttle = history.name === "mock" ? 0 : HISTORY_THROTTLE_MS;
  let rows = 0;
  for (const r of ranges) {
    if (!(await budgetAllows(history.name, 1, "history backfill"))) break;
    const days = await history.fetchDaily({ lat: cell.lat, lon: cell.lon }, r.start, r.end);
    const out = toObservedRows(cell.id, days, "final");
    await upsertFinal(out);
    rows += out.length;
    if (throttle) await sleep(throttle);
  }
  return rows;
}

export const yesterdayOf = (d: string) => addDaysIso(d, -1);
