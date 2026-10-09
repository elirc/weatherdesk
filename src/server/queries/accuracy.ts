import "server-only";
import { asc, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { accuracyStats } from "@/db/schema";
import type { AccuracyRow } from "@/components/climate/lib/accuracy-aggregate";

/** Forecast accuracy queries for the public /accuracy page (A4). */

/** Distinct months (YYYY-MM-01) present in accuracy_stats, ascending. */
export async function listAccuracyMonths(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: accuracyStats.month })
    .from(accuracyStats)
    .orderBy(asc(accuracyStats.month));
  return rows.map((r) => r.month);
}

export async function getAccuracyRows(months: string[]): Promise<AccuracyRow[]> {
  if (!months.length) return [];
  return db
    .select({
      month: accuracyStats.month,
      zone: accuracyStats.zone,
      leadDays: accuracyStats.leadDays,
      maeTmax: accuracyStats.maeTmax,
      maeTmin: accuracyStats.maeTmin,
      rainHitRate: accuracyStats.rainHitRate,
      nSamples: accuracyStats.nSamples,
    })
    .from(accuracyStats)
    .where(inArray(accuracyStats.month, months))
    .orderBy(asc(accuracyStats.zone), asc(accuracyStats.leadDays));
}

export async function getAccuracyComputedAt(months: string[]): Promise<Date | null> {
  if (!months.length) return null;
  const [row] = await db
    .select({ at: max(accuracyStats.computedAt) })
    .from(accuracyStats)
    .where(inArray(accuracyStats.month, months));
  return row?.at ?? null;
}

/** Total stored rows (fresh-install detection). */
export async function countAccuracyRows(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(accuracyStats);
  return row?.n ?? 0;
}
