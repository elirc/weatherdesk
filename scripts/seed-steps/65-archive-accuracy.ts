import { sql } from "drizzle-orm";
import { gridCells } from "@/db/schema";
import { syntheticForecastDay } from "@/adapters/mock/climate";
import { ARCHIVE_LEAD_DAYS } from "@/lib/weather/constants";
import { addDaysIso, lagosToday } from "@/lib/time";
import { updateAccuracy } from "@/worker/jobs/accuracy";
import type { SeedContext, SeedCounts, SeedStep } from "../lib/seed-types";

/**
 * Mock mode only: backfill forecast_archive with the forecasts the mock
 * provider WOULD have issued over the past ARCHIVE_BACKFILL_DAYS, then
 * recompute accuracy_stats. Without this a fresh install has an empty
 * accuracy page until real archives accumulate.
 *
 * Deterministic: syntheticForecastDay(lat, lon, target, lead) is exactly what
 * the mock forecast adapter serves, so accuracy numbers are consistent with
 * the seeded observed_daily (same generator, lead-dependent noise).
 */

const ARCHIVE_BACKFILL_DAYS = 92;

async function run(ctx: SeedContext): Promise<SeedCounts> {
  if (ctx.mode !== "mock") return { skipped: "real mode" };

  const today = lagosToday();
  const start = addDaysIso(today, -ARCHIVE_BACKFILL_DAYS);

  const [{ existing }] = (
    await ctx.pool.query<{ existing: string }>(
      `select count(*) as existing from forecast_archive where target_date >= $1 and target_date < $2`,
      [start, today],
    )
  ).rows;
  // idempotency: a prior full backfill leaves ~cells×days×leads rows
  const cells = await ctx.db
    .select({ id: gridCells.id, lat: gridCells.centreLat, lon: gridCells.centreLon })
    .from(gridCells)
    .where(sql`${gridCells.origin} = 'lga'`);
  const expected = cells.length * ARCHIVE_BACKFILL_DAYS * ARCHIVE_LEAD_DAYS.length;
  if (Number(existing) >= expected * 0.95) {
    return { skipped: "already backfilled", rows: Number(existing) };
  }

  let written = 0;
  const targetDates: string[] = [];
  for (let d = 0; d < ARCHIVE_BACKFILL_DAYS; d++) targetDates.push(addDaysIso(start, d));

  for (const [i, cell] of cells.entries()) {
    const cellIds: number[] = [];
    const issues: string[] = [];
    const targets: string[] = [];
    const leads: number[] = [];
    const rains: number[] = [];
    const probs: number[] = [];
    const tmaxs: number[] = [];
    const tmins: number[] = [];
    for (const target of targetDates) {
      for (const lead of ARCHIVE_LEAD_DAYS) {
        const f = syntheticForecastDay(cell.lat, cell.lon, target, lead);
        cellIds.push(cell.id);
        issues.push(addDaysIso(target, -lead));
        targets.push(target);
        leads.push(lead);
        rains.push(f.rainMm);
        probs.push(f.rainProbPct);
        tmaxs.push(f.tmaxC);
        tmins.push(f.tminC);
      }
    }
    await ctx.pool.query(
      `insert into forecast_archive
         (grid_cell_id, issue_date, target_date, lead_days, rain_mm, rain_prob_pct, tmax_c, tmin_c)
       select * from unnest(
         $1::int[], $2::date[], $3::date[], $4::smallint[],
         $5::real[], $6::real[], $7::real[], $8::real[])
       on conflict (grid_cell_id, issue_date, target_date) do nothing`,
      [cellIds, issues, targets, leads, rains, probs, tmaxs, tmins],
    );
    written += cellIds.length;
    if ((i + 1) % 100 === 0) ctx.log(`archive backfill ${i + 1}/${cells.length} cells`);
  }

  const { months, buckets } = await updateAccuracy(addDaysIso(today, -1), targetDates);
  return { archiveRows: written, accuracyMonths: months.length, accuracyBuckets: buckets };
}

export const step: SeedStep = { name: "archive-accuracy", run };
