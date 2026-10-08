import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gridCells } from "@/db/schema";
import { gridCentre, gridIdx } from "@/lib/geo/zones";

/**
 * Grid-cell helpers local to the worker (A1 owns the shared geo lib; this
 * avoids a cross-agent dependency).
 */

export type CellLite = { id: number; lat: number; lon: number };

/**
 * Upsert the 0.1° cell containing (lat, lon), mark it active and viewed now.
 * New cells get origin 'on_demand'; existing cells keep their origin.
 */
export async function ensureGridCell(lat: number, lon: number, origin: "on_demand" | "lga" = "on_demand"): Promise<CellLite> {
  const latIdx = gridIdx(lat);
  const lonIdx = gridIdx(lon);
  const now = new Date();
  const [row] = await db
    .insert(gridCells)
    .values({
      latIdx,
      lonIdx,
      centreLat: gridCentre(latIdx),
      centreLon: gridCentre(lonIdx),
      active: true,
      origin,
      lastViewedAt: now,
    })
    .onConflictDoUpdate({
      target: [gridCells.latIdx, gridCells.lonIdx],
      set: { active: true, lastViewedAt: now },
    })
    .returning({ id: gridCells.id, lat: gridCells.centreLat, lon: gridCells.centreLon });
  return row;
}

export async function loadCells(ids: readonly number[]): Promise<CellLite[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: gridCells.id, lat: gridCells.centreLat, lon: gridCells.centreLon })
    .from(gridCells)
    .where(inArray(gridCells.id, [...ids]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // preserve requested order
  return ids.map((id) => byId.get(id)).filter((r): r is CellLite => r != null);
}

export async function activeCells(): Promise<CellLite[]> {
  return db
    .select({ id: gridCells.id, lat: gridCells.centreLat, lon: gridCells.centreLon })
    .from(gridCells)
    .where(eq(gridCells.active, true))
    .orderBy(gridCells.id);
}
