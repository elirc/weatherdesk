import os from "node:os";
import { sql } from "drizzle-orm";
import { syntheticObserved } from "@/adapters/mock/climate";
import { gridCells, normalsMonthly, normalsSeason } from "@/db/schema";
import { addDaysIso, dateRange, lagosToday } from "@/lib/time";
import { NormalsPool } from "../lib/normals-pool";
import type { SeedCounts, SeedStep } from "../lib/seed-types";

/**
 * MOCK MODE ONLY. In real mode history comes from the worker's NASA POWER
 * backfill (historyBackfillCell / normalsComputeCell).
 *
 * observed_daily: the last HISTORY_DAYS days (ending yesterday, Lagos) for
 * every grid cell from syntheticObserved — 'nasa_power' final, except the
 * last PRELIMINARY_DAYS which are 'model_estimate' + preliminary, mirroring
 * the real pipeline's NASA latency. One 730-row upsert per cell; cells that
 * already have the full, correctly-flagged window are skipped.
 *
 * normals_monthly / normals_season: 1991–2020 synthetic climate per cell
 * (scripts/lib/normals.ts), computed on a small worker pool; cells that
 * already have 12 monthly rows + a season row are skipped.
 */
export const HISTORY_DAYS = 730;
export const PRELIMINARY_DAYS = 7;
const NORMALS_CHUNK = 50;

export const step: SeedStep = {
  name: "history-normals",
  async run({ db, pool, mode, root, log, warn }): Promise<SeedCounts> {
    if (mode !== "mock") {
      warn("WD_MODE=real — skipping synthetic history/normals (run the worker backfill instead)");
      return { skipped: "real-mode" };
    }

    const cells = await db
      .select({ id: gridCells.id, lat: gridCells.centreLat, lon: gridCells.centreLon })
      .from(gridCells)
      .orderBy(gridCells.id);
    if (!cells.length) throw new Error("no grid cells — run step 20 first");

    // ── observed_daily ────────────────────────────────────────────────────
    const end = addDaysIso(lagosToday(), -1);
    const start = addDaysIso(end, -(HISTORY_DAYS - 1));
    const prelimFrom = addDaysIso(end, -(PRELIMINARY_DAYS - 1));
    const dates = dateRange(start, end);
    log(`observed window ${start} … ${end} (${dates.length} days; preliminary from ${prelimFrom})`);

    const coverage = await db.execute<{ cell: number; n: number; wrong: number }>(sql`
      select grid_cell_id as cell,
             count(*)::int as n,
             count(*) filter (where preliminary <> (date >= ${prelimFrom}::date))::int as wrong
      from observed_daily
      where date between ${start}::date and ${end}::date
      group by grid_cell_id`);
    const complete = new Set(
      coverage.rows.filter((r) => r.n === dates.length && r.wrong === 0).map((r) => r.cell),
    );

    const now = new Date();
    let observedRows = 0;
    let observedCells = 0;
    const tObs = Date.now();
    for (const cell of cells) {
      if (complete.has(cell.id)) continue;
      const n = dates.length;
      const rain = new Array<number>(n);
      const tmax = new Array<number>(n);
      const tmin = new Array<number>(n);
      const hum = new Array<number>(n);
      const wind = new Array<number>(n);
      const solar = new Array<number>(n);
      const prelim = new Array<boolean>(n);
      for (let k = 0; k < n; k++) {
        const d = syntheticObserved(cell.lat, cell.lon, dates[k]);
        rain[k] = d.rainMm;
        tmax[k] = d.tmaxC;
        tmin[k] = d.tminC;
        hum[k] = d.humidityPct;
        wind[k] = d.windKmh;
        solar[k] = d.solarMjM2;
        prelim[k] = dates[k] >= prelimFrom;
      }
      // Bulk path: one set-based statement per cell over typed arrays. A
      // 730-row drizzle .values() costs ~3 s to build + bind on this box vs
      // ~0.2 s here, so this (and only this) insert bypasses the query builder.
      await pool.query(
        `insert into observed_daily
           (grid_cell_id, date, rain_mm, tmax_c, tmin_c, humidity_pct, wind_kmh, solar_mj_m2,
            source, preliminary, updated_at)
         select $1::int, t.date, t.rain, t.tmax, t.tmin, t.hum, t.wind, t.solar,
                case when t.prelim then 'model_estimate' else 'nasa_power' end, t.prelim, $10::timestamptz
         from unnest($2::date[], $3::real[], $4::real[], $5::real[], $6::real[], $7::real[], $8::real[], $9::boolean[])
           as t(date, rain, tmax, tmin, hum, wind, solar, prelim)
         on conflict (grid_cell_id, date) do update set
           rain_mm = excluded.rain_mm, tmax_c = excluded.tmax_c, tmin_c = excluded.tmin_c,
           humidity_pct = excluded.humidity_pct, wind_kmh = excluded.wind_kmh,
           solar_mj_m2 = excluded.solar_mj_m2, source = excluded.source,
           preliminary = excluded.preliminary, updated_at = excluded.updated_at
         -- never downgrade a final value to a preliminary estimate
         where observed_daily.preliminary = true or excluded.preliminary = false`,
        [cell.id, dates, rain, tmax, tmin, hum, wind, solar, prelim, now],
      );
      observedRows += n;
      observedCells += 1;
      if (observedCells % 100 === 0) {
        log(`observed: ${observedCells} cells, ${observedRows} rows (${((Date.now() - tObs) / 1000).toFixed(0)}s)`);
      }
    }
    log(`observed: ${observedCells} cells written, ${complete.size} already complete`);

    // ── normals ───────────────────────────────────────────────────────────
    const have = await db.execute<{ cell: number }>(sql`
      select m.grid_cell_id as cell
      from normals_monthly m
      join normals_season s on s.grid_cell_id = m.grid_cell_id
      group by m.grid_cell_id
      having count(*) = 12`);
    const haveNormals = new Set(have.rows.map((r) => r.cell));
    const todo = cells.filter((c) => !haveNormals.has(c.id));

    let seasonNull = 0;
    if (todo.length) {
      const threads = Math.max(1, Math.min(4, os.cpus().length - 2));
      const workerPool = new NormalsPool(root, threads);
      log(`normals: ${todo.length} cells on ${workerPool.threads || "inline"} thread(s)`);
      const tN = Date.now();
      try {
        for (let i = 0; i < todo.length; i += NORMALS_CHUNK) {
          const chunk = todo.slice(i, i + NORMALS_CHUNK);
          const results = await Promise.all(chunk.map((c) => workerPool.compute(c.id, c.lat, c.lon)));
          const monthly = chunk.flatMap((c, k) =>
            results[k].monthly.map((m) => ({ gridCellId: c.id, ...m })),
          );
          const season = chunk.map((c, k) => ({
            gridCellId: c.id,
            ...results[k].season,
            method: "agro_onset_v1",
          }));
          seasonNull += season.filter((s) => s.onsetDoy == null).length;
          await db
            .insert(normalsMonthly)
            .values(monthly)
            .onConflictDoUpdate({
              target: [normalsMonthly.gridCellId, normalsMonthly.month],
              set: {
                rainMm: sql`excluded.rain_mm`,
                rainyDays: sql`excluded.rainy_days`,
                tmaxC: sql`excluded.tmax_c`,
                tminC: sql`excluded.tmin_c`,
              },
            });
          await db
            .insert(normalsSeason)
            .values(season)
            .onConflictDoUpdate({
              target: normalsSeason.gridCellId,
              set: {
                onsetDoy: sql`excluded.onset_doy`,
                cessationDoy: sql`excluded.cessation_doy`,
                seasonLengthDays: sql`excluded.season_length_days`,
                method: sql`excluded.method`,
              },
            });
          log(
            `normals: ${Math.min(i + NORMALS_CHUNK, todo.length)}/${todo.length} cells (${((Date.now() - tN) / 1000).toFixed(0)}s)`,
          );
        }
      } finally {
        await workerPool.close();
      }
    }

    const counts = await db.execute<{ obs: number; nm: number; ns: number }>(sql`
      select (select count(*) from observed_daily)::int as obs,
             (select count(*) from normals_monthly)::int as nm,
             (select count(*) from normals_season)::int as ns`);
    const c = counts.rows[0];
    return {
      cells: cells.length,
      observedWritten: observedRows,
      observedTotal: c.obs,
      normalsMonthly: c.nm,
      normalsSeason: c.ns,
      seasonWithoutOnset: seasonNull,
    };
  },
};
