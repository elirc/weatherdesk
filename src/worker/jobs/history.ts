import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { normalsMonthly, normalsSeason, observedDaily } from "@/db/schema";
import { JOBS, sendJob } from "@/lib/queue";
import { loadCells } from "../cells";
import { yearChunks } from "../core/chunk";
import { computeMonthlyNormals, computeSeasonNormal } from "../core/normals";
import { excludedSet } from "../db-util";
import { log } from "../log";
import { backfillCell } from "./observed";
import { PROVIDER_RETRY } from "./forecast";

/** history.backfill-cell — year-chunked NASA fetch → observed_daily, then queue normals. */
export async function historyBackfillCell(data: { gridCellId: number; startDate: string; endDate: string }) {
  const [cell] = await loadCells([data.gridCellId]);
  if (!cell) {
    log.warn("backfill: unknown grid cell", { gridCellId: data.gridCellId });
    return { rows: 0 };
  }
  const ranges = yearChunks(data.startDate, data.endDate);
  const rows = await backfillCell(cell, ranges);
  await sendJob(JOBS.normalsComputeCell, { gridCellId: cell.id }, { ...PROVIDER_RETRY, singletonKey: `normals:${cell.id}` });
  log.info("backfill done", { gridCellId: cell.id, years: ranges.length, rows });
  return { rows, years: ranges.length };
}

/** normals.compute-cell — normals_monthly (1991–2020) + normals_season (median onset/cessation). */
export async function normalsComputeCell(data: { gridCellId: number }) {
  const days = await db
    .select({
      date: observedDaily.date,
      rainMm: observedDaily.rainMm,
      tmaxC: observedDaily.tmaxC,
      tminC: observedDaily.tminC,
    })
    .from(observedDaily)
    .where(eq(observedDaily.gridCellId, data.gridCellId))
    .orderBy(asc(observedDaily.date));

  const monthly = computeMonthlyNormals(days);
  if (monthly.length) {
    await db
      .insert(normalsMonthly)
      .values(
        monthly.map((m) => ({
          gridCellId: data.gridCellId,
          month: m.month,
          rainMm: m.rainMm,
          rainyDays: m.rainyDays,
          tmaxC: m.tmaxC,
          tminC: m.tminC,
        })),
      )
      .onConflictDoUpdate({
        target: [normalsMonthly.gridCellId, normalsMonthly.month],
        set: excludedSet(normalsMonthly, ["gridCellId", "month"]),
      });
  } else {
    log.warn("normals: no qualifying 1991–2020 months — normals_monthly left unchanged", { gridCellId: data.gridCellId });
  }

  const season = computeSeasonNormal(days);
  if (season.nYears > 0) {
    await db
      .insert(normalsSeason)
      .values({
        gridCellId: data.gridCellId,
        onsetDoy: season.onsetDoy,
        cessationDoy: season.cessationDoy,
        seasonLengthDays: season.seasonLengthDays,
        method: "agro_onset_v1",
      })
      .onConflictDoUpdate({
        target: normalsSeason.gridCellId,
        set: excludedSet(normalsSeason, ["gridCellId"]),
      });
  }
  return { months: monthly.length, seasonYears: season.nYears };
}
