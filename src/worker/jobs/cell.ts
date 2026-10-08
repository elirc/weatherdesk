import { eq } from "drizzle-orm";
import { db } from "@/db";
import { observedDaily } from "@/db/schema";
import { inNigeriaBbox } from "@/lib/geo/zones";
import { JOBS, sendJob } from "@/lib/queue";
import { addDaysIso, lagosToday } from "@/lib/time";
import { NORMALS_START_YEAR } from "@/lib/weather/constants";
import { ensureGridCell } from "../cells";
import { NASA_LAG_DAYS } from "../core/observed";
import { log } from "../log";
import { fetchAndStoreForecast, PROVIDER_RETRY } from "./forecast";

/**
 * cell.activate — a user viewed an uncovered point: upsert + activate its
 * grid cell (origin 'on_demand' when new), fetch its forecast immediately, and
 * queue a history backfill when the cell has no observations yet.
 */
export async function cellActivate(data: { lat: number; lon: number }) {
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon) || !inNigeriaBbox(data.lat, data.lon)) {
    log.warn("cell.activate: point outside Nigeria bbox — ignored", data);
    return { ignored: true };
  }
  const cell = await ensureGridCell(data.lat, data.lon, "on_demand");
  const forecast = await fetchAndStoreForecast([cell]);

  const [hasObs] = await db
    .select({ d: observedDaily.date })
    .from(observedDaily)
    .where(eq(observedDaily.gridCellId, cell.id))
    .limit(1);
  let backfillQueued = false;
  if (!hasObs) {
    await sendJob(
      JOBS.historyBackfillCell,
      { gridCellId: cell.id, startDate: `${NORMALS_START_YEAR}-01-01`, endDate: addDaysIso(lagosToday(), -NASA_LAG_DAYS) },
      { ...PROVIDER_RETRY, singletonKey: `backfill:${cell.id}` },
    );
    backfillQueued = true;
  }
  return { gridCellId: cell.id, ...forecast, backfillQueued };
}
