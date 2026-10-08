import "dotenv/config";
import "./preload-env";
import { and, eq, notExists } from "drizzle-orm";
import { db, pool } from "@/db";
import { gridCells, observedDaily } from "@/db/schema";
import { getBoss, JOBS, sendJob, startedBoss } from "@/lib/queue";
import { addDaysIso, lagosToday } from "@/lib/time";
import { NORMALS_START_YEAR } from "@/lib/weather/constants";
import { NASA_LAG_DAYS } from "./core/observed";
import { PROVIDER_RETRY } from "./jobs/forecast";
import { REGISTRATIONS } from "./registry";

/**
 * Enqueue NASA POWER history backfill for grid cells (throttled fan-out).
 *
 *   pnpm tsx src/worker/enqueue-backfill.ts [--start 1991-01-01] [--end YYYY-MM-DD]
 *        [--spacing 20] [--limit N] [--all] [--only-active]
 *
 * --spacing  seconds between job start times (startAfter stagger; default 20)
 * --limit    enqueue at most N cells
 * --all      include cells that already have observations (default: only cells without any)
 * --only-active  only active cells
 * The worker must be running to process the jobs.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const start = arg("start") ?? `${NORMALS_START_YEAR}-01-01`;
  const end = arg("end") ?? addDaysIso(lagosToday(), -NASA_LAG_DAYS);
  const spacing = Number(arg("spacing") ?? 20);
  const limit = arg("limit") ? Number(arg("limit")) : undefined;

  const conds = [];
  if (flag("only-active")) conds.push(eq(gridCells.active, true));
  if (!flag("all")) {
    conds.push(
      notExists(db.select({ x: observedDaily.date }).from(observedDaily).where(eq(observedDaily.gridCellId, gridCells.id))),
    );
  }
  let q = db
    .select({ id: gridCells.id })
    .from(gridCells)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(gridCells.id)
    .$dynamic();
  if (limit) q = q.limit(limit);
  const cells = await q;

  const boss = await startedBoss();
  const r = REGISTRATIONS.find((x) => x.name === JOBS.historyBackfillCell);
  await boss.createQueue(JOBS.historyBackfillCell, r?.queue);
  await boss.createQueue(JOBS.normalsComputeCell, REGISTRATIONS.find((x) => x.name === JOBS.normalsComputeCell)?.queue);

  let queued = 0;
  for (let i = 0; i < cells.length; i++) {
    const id = await sendJob(
      JOBS.historyBackfillCell,
      { gridCellId: cells[i].id, startDate: start, endDate: end },
      { ...PROVIDER_RETRY, singletonKey: `backfill:${cells[i].id}`, startAfter: Math.round(i * spacing) },
    );
    if (id) queued += 1;
  }
  console.log(`enqueue-backfill: ${queued}/${cells.length} cells queued (${start}..${end}, spacing ${spacing}s)`);
  await getBoss().stop({ graceful: false });
  await pool.end();
}

main().catch(async (e) => {
  console.error("enqueue-backfill failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
