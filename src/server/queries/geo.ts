import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { lgas, settlements, states } from "@/db/schema";
import { lgaBySlug, pointToLga, settlementById, stateBySlug } from "@/lib/geo/lookup";
import { searchPlaces } from "@/lib/geo/search";
import {
  getNationalLgaCollection,
  getStateLgaCollection,
  getStatesCollection,
} from "@/lib/geo/simplified";
import type { Zone } from "@/lib/geo/zones";

/**
 * Server-only geography queries used by pages and route handlers.
 * Thin wrappers over src/lib/geo/* plus a few list queries.
 */

export {
  lgaBySlug as getLgaBySlug,
  stateBySlug as getStateBySlug,
  settlementById as getSettlementById,
  pointToLga as getLgaForPoint,
  searchPlaces,
  getNationalLgaCollection,
  getStatesCollection,
  getStateLgaCollection,
};

export type StateListItem = {
  id: number;
  slug: string;
  name: string;
  code: string;
  zone: Zone;
  centreLat: number;
  centreLon: number;
  lgaCount: number;
};

/** All 37 states alphabetically, with LGA counts. */
export async function listStates(): Promise<StateListItem[]> {
  const rows = await db
    .select({
      id: states.id,
      slug: states.slug,
      name: states.name,
      code: states.code,
      zone: states.zone,
      centreLat: states.centreLat,
      centreLon: states.centreLon,
      lgaCount: count(lgas.id),
    })
    .from(states)
    .leftJoin(lgas, eq(lgas.stateId, states.id))
    .groupBy(states.id)
    .orderBy(asc(states.name));
  return rows.map((r) => ({ ...r, lgaCount: Number(r.lgaCount) }));
}

export type LgaListItem = {
  id: number;
  slug: string;
  name: string;
  centreLat: number;
  centreLon: number;
  gridCellId: number | null;
};

/** LGAs of a state alphabetically. */
export async function listLgasForState(stateId: number): Promise<LgaListItem[]> {
  return db
    .select({
      id: lgas.id,
      slug: lgas.slug,
      name: lgas.name,
      centreLat: lgas.centreLat,
      centreLon: lgas.centreLon,
      gridCellId: lgas.gridCellId,
    })
    .from(lgas)
    .where(eq(lgas.stateId, stateId))
    .orderBy(asc(lgas.name));
}

export type LgaIndexItem = {
  slug: string;
  name: string;
  stateSlug: string;
  stateName: string;
  zone: Zone;
};

/** Every LGA (774) with its state — for sitemap, static params, A–Z index. */
export async function listAllLgas(): Promise<LgaIndexItem[]> {
  return db
    .select({
      slug: lgas.slug,
      name: lgas.name,
      stateSlug: states.slug,
      stateName: states.name,
      zone: lgas.zone,
    })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .orderBy(asc(states.name), asc(lgas.name));
}

export type SettlementListItem = {
  id: number;
  name: string;
  kind: string | null;
  lat: number;
  lon: number;
};

/** Settlements inside an LGA (towns list on the LGA page). */
export async function listSettlementsForLga(lgaId: number, limit = 50): Promise<SettlementListItem[]> {
  return db
    .select({
      id: settlements.id,
      name: settlements.name,
      kind: settlements.kind,
      lat: settlements.lat,
      lon: settlements.lon,
    })
    .from(settlements)
    .where(eq(settlements.lgaId, lgaId))
    .orderBy(asc(settlements.name))
    .limit(Math.max(1, Math.min(500, limit)));
}
