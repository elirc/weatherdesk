import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lgas, states } from "@/db/schema";
import type {
  AreaFeatureCollection,
  AreaGeometry,
  LgaBoundaryProps,
  StateBoundaryProps,
} from "./types";

/**
 * Pre-simplified boundary layers for maps (CONVENTIONS rule 4), built from
 * the boundary_geojson columns (seeded with turf.simplify, ~0.6 MB for all
 * 774 LGAs). Cached per server process — boundaries only change on re-seed;
 * call clearSimplifiedCache() after a re-seed in long-lived processes.
 * Feature `id` and properties.id are the DB ids.
 */

let lgaCache: Promise<AreaFeatureCollection<LgaBoundaryProps>> | null = null;
let stateCache: Promise<AreaFeatureCollection<StateBoundaryProps>> | null = null;

async function loadLgas(): Promise<AreaFeatureCollection<LgaBoundaryProps>> {
  const rows = await db
    .select({
      id: lgas.id,
      slug: lgas.slug,
      name: lgas.name,
      zone: lgas.zone,
      stateSlug: states.slug,
      geometry: lgas.boundaryGeojson,
    })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .orderBy(asc(lgas.id));
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: { id: r.id, slug: r.slug, name: r.name, stateSlug: r.stateSlug, zone: r.zone },
      geometry: r.geometry as AreaGeometry,
    })),
  };
}

async function loadStates(): Promise<AreaFeatureCollection<StateBoundaryProps>> {
  const rows = await db
    .select({
      id: states.id,
      slug: states.slug,
      name: states.name,
      code: states.code,
      zone: states.zone,
      geometry: states.boundaryGeojson,
    })
    .from(states)
    .orderBy(asc(states.name));
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      id: r.id,
      properties: { id: r.id, slug: r.slug, name: r.name, code: r.code, zone: r.zone },
      geometry: r.geometry as AreaGeometry,
    })),
  };
}

function cached<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>) {
  const existing = get();
  if (existing) return existing;
  const p = load().catch((err) => {
    set(null); // don't cache failures
    throw err;
  });
  set(p);
  return p;
}

/** All 774 LGAs, simplified. */
export function getNationalLgaCollection(): Promise<AreaFeatureCollection<LgaBoundaryProps>> {
  return cached(() => lgaCache, (p) => (lgaCache = p), loadLgas);
}

/** All 37 states (36 + FCT), simplified. */
export function getStatesCollection(): Promise<AreaFeatureCollection<StateBoundaryProps>> {
  return cached(() => stateCache, (p) => (stateCache = p), loadStates);
}

/** LGAs of one state (filtered from the cached national layer). */
export async function getStateLgaCollection(
  stateSlug: string,
): Promise<AreaFeatureCollection<LgaBoundaryProps>> {
  const all = await getNationalLgaCollection();
  return {
    type: "FeatureCollection",
    features: all.features.filter((f) => f.properties.stateSlug === stateSlug),
  };
}

export function clearSimplifiedCache(): void {
  lgaCache = null;
  stateCache = null;
}
