import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { forecastArchive, forecastDaily, gridCells } from "@/db/schema";
import { ARCHIVE_LEAD_DAYS } from "@/lib/weather/constants";
import { lagosToday } from "@/lib/time";
import { activeCells } from "../cells";
import { archiveTargetDates, selectArchiveSnapshots } from "../core/archive";
import { chunk } from "../core/chunk";
import { errMessage, log } from "../log";
import { evaluateAndIssueAlerts } from "./alerts";
import { updateAccuracy } from "./accuracy";
import { nasaTopUp, storeRecentObserved, yesterdayOf } from "./observed";

export const ON_DEMAND_TTL_DAYS = 7;

/** (a) Snapshot forecast_daily into forecast_archive for ARCHIVE_LEAD_DAYS (issueDate = Lagos today). */
export async function archiveSnapshot(issueDate: string): Promise<number> {
  const targets = [...archiveTargetDates(issueDate, ARCHIVE_LEAD_DAYS).keys()];
  const rows = await db
    .select({
      gridCellId: forecastDaily.gridCellId,
      date: forecastDaily.date,
      rainMm: forecastDaily.rainMm,
      rainProbPct: forecastDaily.rainProbPct,
      tmaxC: forecastDaily.tmaxC,
      tminC: forecastDaily.tminC,
    })
    .from(forecastDaily)
    .where(inArray(forecastDaily.date, targets));
  const snaps = selectArchiveSnapshots(rows, issueDate, ARCHIVE_LEAD_DAYS);
  // The 01:30 snapshot is canonical: re-runs on the same day keep the first one.
  for (const part of chunk(snaps, 1000)) {
    await db.insert(forecastArchive).values(part).onConflictDoNothing();
  }
  return snaps.length;
}

/** (f) Deactivate on-demand cells nobody viewed for ON_DEMAND_TTL_DAYS. */
export async function deactivateStaleOnDemand(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ON_DEMAND_TTL_DAYS * 86_400_000);
  const res = await db
    .update(gridCells)
    .set({ active: false })
    .where(
      and(
        eq(gridCells.origin, "on_demand"),
        eq(gridCells.active, true),
        or(lt(gridCells.lastViewedAt, cutoff), and(isNull(gridCells.lastViewedAt), lt(gridCells.createdAt, cutoff))),
      ),
    )
    .returning({ id: gridCells.id });
  return res.length;
}

/**
 * daily.pipeline — every step runs even when an earlier one fails (a provider
 * outage must not block alerts on existing data); the job fails at the end if
 * any step failed so job_runs shows it. All steps are idempotent.
 */
export async function dailyPipeline(data: { date?: string }): Promise<Record<string, unknown>> {
  const today = data.date ?? lagosToday();
  const summary: Record<string, unknown> = { today };
  const failed: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      summary[name] = r;
      log.info(`daily.pipeline step ok: ${name}`, { ms: Date.now() - t0 });
      return r;
    } catch (e) {
      failed.push(name);
      summary[name] = { error: errMessage(e) };
      log.error(`daily.pipeline step failed: ${name}`, { error: errMessage(e) });
      return undefined;
    }
  };

  const cells = await activeCells();
  await step("archive", () => archiveSnapshot(today));
  await step("preliminaryObserved", () => storeRecentObserved(cells, 7));
  const topUp = await step("nasaTopUp", async () => {
    const r = await nasaTopUp(cells, today);
    return { cells: r.cells, failures: r.failures, finalisedDates: r.finalised.size, _set: r.finalised };
  });
  if (topUp) summary.nasaTopUp = { cells: topUp.cells, failures: topUp.failures, finalisedDates: topUp.finalisedDates };
  await step("alerts", () => evaluateAndIssueAlerts(today));
  await step("accuracy", () => updateAccuracy(yesterdayOf(today), topUp?._set ?? []));
  await step("deactivateOnDemand", () => deactivateStaleOnDemand());

  log.info("daily.pipeline finished", { today, failed });
  if (failed.length) throw new Error(`daily.pipeline steps failed: ${failed.join(", ")}`);
  return summary;
}
