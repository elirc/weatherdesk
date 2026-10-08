import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { accuracyStats, forecastArchive, lgas, observedDaily } from "@/db/schema";
import { affectedMonths, aggregateAccuracy, type AccuracyPair } from "../core/accuracy";
import { chunk } from "../core/chunk";
import { monthEndOf } from "../core/periods";
import { excludedSet } from "../db-util";
import { log } from "../log";

/** cell id → distinct zones of its LGAs. */
export async function loadCellZones(): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ cell: lgas.gridCellId, zone: lgas.zone })
    .from(lgas)
    .where(isNotNull(lgas.gridCellId));
  const m = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.cell == null) continue;
    let s = m.get(r.cell);
    if (!s) {
      s = new Set();
      m.set(r.cell, s);
    }
    s.add(r.zone);
  }
  return new Map([...m].map(([k, v]) => [k, [...v]]));
}

/**
 * (e) Recompute accuracy_stats from scratch for every affected month
 * (yesterday's month + months of newly finalised dates).
 */
export async function updateAccuracy(yesterday: string, finalisedDates: Iterable<string>): Promise<{ months: string[]; buckets: number }> {
  const months = affectedMonths(yesterday, finalisedDates);
  const cellZones = await loadCellZones();
  let buckets = 0;
  for (const month of months) {
    const end = monthEndOf(month);
    const pairs: AccuracyPair[] = await db
      .select({
        gridCellId: forecastArchive.gridCellId,
        targetDate: forecastArchive.targetDate,
        leadDays: forecastArchive.leadDays,
        fcTmaxC: forecastArchive.tmaxC,
        fcTminC: forecastArchive.tminC,
        fcRainProbPct: forecastArchive.rainProbPct,
        obsTmaxC: observedDaily.tmaxC,
        obsTminC: observedDaily.tminC,
        obsRainMm: observedDaily.rainMm,
      })
      .from(forecastArchive)
      .innerJoin(
        observedDaily,
        and(eq(forecastArchive.gridCellId, observedDaily.gridCellId), eq(forecastArchive.targetDate, observedDaily.date)),
      )
      .where(and(gte(forecastArchive.targetDate, month), lte(forecastArchive.targetDate, end)));
    const stats = aggregateAccuracy(pairs, cellZones);
    const now = new Date();
    for (const part of chunk(stats, 500)) {
      await db
        .insert(accuracyStats)
        .values(part.map((s) => ({ ...s, computedAt: now })))
        .onConflictDoUpdate({
          target: [accuracyStats.month, accuracyStats.zone, accuracyStats.leadDays],
          set: excludedSet(accuracyStats, ["id", "month", "zone", "leadDays"]),
        });
    }
    buckets += stats.length;
    log.info("accuracy recomputed", { month, pairs: pairs.length, buckets: stats.length });
  }
  return { months, buckets };
}
