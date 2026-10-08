import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gridCells, lgas, settlements, states } from "@/db/schema";
import type { AreaGeometry } from "./types";
import { gridCentre, gridIdx, inNigeriaBbox, type Zone } from "./zones";

/**
 * Point / slug / id lookups against the geography tables. Used by server
 * code only (pages go through src/server/queries/geo.ts). Raw SQL is limited
 * to the PostGIS predicate.
 */

export type LgaLocation = {
  lgaId: number;
  lgaSlug: string;
  lgaName: string;
  stateId: number;
  stateSlug: string;
  stateName: string;
  zone: Zone;
  gridCellId: number | null;
};

/** The LGA whose boundary contains the point (PostGIS ST_Contains), or null (outside Nigeria / in water). */
export async function pointToLga(lat: number, lon: number): Promise<LgaLocation | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inNigeriaBbox(lat, lon)) return null;
  const pt = sql`ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)`;
  const [row] = await db
    .select({
      lgaId: lgas.id,
      lgaSlug: lgas.slug,
      lgaName: lgas.name,
      stateId: states.id,
      stateSlug: states.slug,
      stateName: states.name,
      zone: lgas.zone,
      gridCellId: lgas.gridCellId,
    })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(sql`${lgas.geom} && ${pt} and ST_Contains(${lgas.geom}, ${pt})`)
    .limit(1);
  return row ?? null;
}

export type GridCell = {
  id: number;
  latIdx: number;
  lonIdx: number;
  centreLat: number;
  centreLon: number;
  active: boolean;
  origin: string;
  /** true when this call created the cell (caller may want to enqueue a forecast fetch) */
  created: boolean;
};

/**
 * The 0.1° grid cell containing a point, created on first use (origin
 * 'on_demand', active so the forecast job refreshes it). Every call stamps
 * last_viewed_at — the worker uses it to retire stale on-demand cells.
 * Existing 'lga' cells keep their origin.
 */
export async function ensureGridCell(lat: number, lon: number): Promise<GridCell> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inNigeriaBbox(lat, lon)) {
    throw new RangeError(`Point ${lat},${lon} is outside Nigeria`);
  }
  const latIdx = gridIdx(lat);
  const lonIdx = gridIdx(lon);
  const now = new Date();
  const [cell] = await db
    .insert(gridCells)
    .values({
      latIdx,
      lonIdx,
      centreLat: gridCentre(latIdx),
      centreLon: gridCentre(lonIdx),
      active: true,
      origin: "on_demand",
      lastViewedAt: now,
    })
    .onConflictDoUpdate({
      target: [gridCells.latIdx, gridCells.lonIdx],
      set: { lastViewedAt: now, active: true },
    })
    .returning({
      id: gridCells.id,
      latIdx: gridCells.latIdx,
      lonIdx: gridCells.lonIdx,
      centreLat: gridCells.centreLat,
      centreLon: gridCells.centreLon,
      active: gridCells.active,
      origin: gridCells.origin,
      // xmax = 0 only for freshly inserted tuples
      created: sql<boolean>`(xmax = 0)`,
    });
  return cell;
}

export type StateDetail = {
  id: number;
  slug: string;
  name: string;
  code: string;
  zone: Zone;
  centreLat: number;
  centreLon: number;
  boundaryGeojson: AreaGeometry;
};

export async function stateBySlug(slug: string): Promise<StateDetail | null> {
  const [row] = await db
    .select({
      id: states.id,
      slug: states.slug,
      name: states.name,
      code: states.code,
      zone: states.zone,
      centreLat: states.centreLat,
      centreLon: states.centreLon,
      boundaryGeojson: states.boundaryGeojson,
    })
    .from(states)
    .where(eq(states.slug, slug))
    .limit(1);
  return row ? { ...row, boundaryGeojson: row.boundaryGeojson as AreaGeometry } : null;
}

export type LgaDetail = {
  id: number;
  slug: string;
  name: string;
  code: string;
  zone: Zone;
  centreLat: number;
  centreLon: number;
  gridCellId: number | null;
  boundaryGeojson: AreaGeometry;
  state: { id: number; slug: string; name: string };
};

export async function lgaBySlug(slug: string): Promise<LgaDetail | null> {
  const [row] = await db
    .select({
      id: lgas.id,
      slug: lgas.slug,
      name: lgas.name,
      code: lgas.code,
      zone: lgas.zone,
      centreLat: lgas.centreLat,
      centreLon: lgas.centreLon,
      gridCellId: lgas.gridCellId,
      boundaryGeojson: lgas.boundaryGeojson,
      stateId: states.id,
      stateSlug: states.slug,
      stateName: states.name,
    })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(eq(lgas.slug, slug))
    .limit(1);
  if (!row) return null;
  const { stateId, stateSlug, stateName, boundaryGeojson, ...rest } = row;
  return {
    ...rest,
    boundaryGeojson: boundaryGeojson as AreaGeometry,
    state: { id: stateId, slug: stateSlug, name: stateName },
  };
}

export type SettlementDetail = {
  id: number;
  name: string;
  kind: string | null;
  source: string;
  lat: number;
  lon: number;
  lga: { id: number; slug: string; name: string; gridCellId: number | null };
  state: { id: number; slug: string; name: string };
  zone: Zone;
};

export async function settlementById(id: number): Promise<SettlementDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db
    .select({
      id: settlements.id,
      name: settlements.name,
      kind: settlements.kind,
      source: settlements.source,
      lat: settlements.lat,
      lon: settlements.lon,
      lgaId: lgas.id,
      lgaSlug: lgas.slug,
      lgaName: lgas.name,
      gridCellId: lgas.gridCellId,
      zone: lgas.zone,
      stateId: states.id,
      stateSlug: states.slug,
      stateName: states.name,
    })
    .from(settlements)
    .innerJoin(lgas, eq(lgas.id, settlements.lgaId))
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(eq(settlements.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    lat: row.lat,
    lon: row.lon,
    lga: { id: row.lgaId, slug: row.lgaSlug, name: row.lgaName, gridCellId: row.gridCellId },
    state: { id: row.stateId, slug: row.stateSlug, name: row.stateName },
    zone: row.zone,
  };
}
