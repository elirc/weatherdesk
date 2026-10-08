import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { lgas, states } from "@/db/schema";
import { slugify, uniqueLgaSlugs } from "@/lib/geo/slug";
import { stateMeta } from "@/lib/geo/state-names";
import {
  assignParents,
  centreOf,
  collectionBytes,
  LGA_SIMPLIFY_TOLERANCE,
  loadBoundaries,
  simplifyGeometry,
  STATE_SIMPLIFY_TOLERANCE,
  type AreaGeometry,
} from "../lib/boundaries";
import type { SeedStep } from "../lib/seed-types";

/**
 * 37 states + 774 LGAs from the committed geoBoundaries (GRID3-sourced) files.
 * - boundary_geojson = simplified copy (map rendering, served to clients)
 * - geom             = ORIGINAL geometry, made valid, forced MultiPolygon
 * Upserts on `code` so ids stay stable across re-runs. Also writes the
 * simplified national layers to data/derived/ for DB-free consumers.
 */

const geomSql = (g: AreaGeometry) =>
  sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}),4326)),3))`;

const LGA_BATCH = 25;

export const step: SeedStep = {
  name: "geography",
  async run({ db, root, log, warn }) {
    const rawDir = path.join(root, "data", "boundaries", "raw");
    const stateFeatures = loadBoundaries(path.join(rawDir, "nga-adm1-simplified.geojson"));
    const lgaFeatures = loadBoundaries(path.join(rawDir, "nga-adm2-simplified.geojson"));
    log(`loaded ${stateFeatures.length} state + ${lgaFeatures.length} LGA features`);

    // ── states ──────────────────────────────────────────────────────────
    const stateRows = stateFeatures.map((f) => {
      const meta = stateMeta(f.properties.shapeName);
      if (f.properties.shapeISO && f.properties.shapeISO !== meta.code) {
        warn(`state ${meta.name}: shapeISO ${f.properties.shapeISO} ≠ STATE_CODES ${meta.code}`);
      }
      const [lon, lat] = centreOf(f.geometry);
      return {
        meta,
        slug: slugify(meta.name),
        lat,
        lon,
        simplified: simplifyGeometry(f.geometry, STATE_SIMPLIFY_TOLERANCE),
        geometry: f.geometry,
      };
    });
    if (new Set(stateRows.map((s) => s.meta.code)).size !== stateRows.length) {
      throw new Error("Duplicate state codes after name normalisation");
    }

    for (const s of stateRows) {
      await db
        .insert(states)
        .values({
          name: s.meta.name,
          slug: s.slug,
          code: s.meta.code,
          zone: s.meta.zone,
          centreLat: s.lat,
          centreLon: s.lon,
          boundaryGeojson: s.simplified,
          geom: geomSql(s.geometry),
        })
        .onConflictDoUpdate({
          target: states.code,
          set: {
            name: s.meta.name,
            slug: s.slug,
            zone: s.meta.zone,
            centreLat: s.lat,
            centreLon: s.lon,
            boundaryGeojson: s.simplified,
            geom: geomSql(s.geometry),
          },
        });
    }
    const dbStates = await db
      .select({ id: states.id, code: states.code })
      .from(states);
    const stateIdByCode = new Map(dbStates.map((s) => [s.code, s.id]));

    // ── LGAs: spatial parent, slugs, simplified copies ────────────────────
    const centres = lgaFeatures.map((f) => centreOf(f.geometry));
    const { parentIdx, fallbacks } = assignParents(
      stateRows.map((s) => s.geometry),
      lgaFeatures.map((f, i) => ({ geometry: f.geometry, centre: centres[i] })),
    );
    if (fallbacks) warn(`${fallbacks} LGA centre(s) outside every state → largest-overlap parent`);

    const slugs = uniqueLgaSlugs(
      lgaFeatures.map((f, i) => ({
        name: f.properties.shapeName.trim(),
        stateSlug: stateRows[parentIdx[i]].slug,
      })),
    );

    const lgaRows = lgaFeatures.map((f, i) => {
      const parent = stateRows[parentIdx[i]];
      return {
        name: f.properties.shapeName.trim(),
        slug: slugs[i],
        code: f.properties.shapeID,
        stateId: stateIdByCode.get(parent.meta.code)!,
        stateSlug: parent.slug,
        zone: parent.meta.zone,
        centreLat: centres[i][1],
        centreLon: centres[i][0],
        simplified: simplifyGeometry(f.geometry, LGA_SIMPLIFY_TOLERANCE),
        geometry: f.geometry,
      };
    });

    for (let i = 0; i < lgaRows.length; i += LGA_BATCH) {
      const batch = lgaRows.slice(i, i + LGA_BATCH);
      await db
        .insert(lgas)
        .values(
          batch.map((l) => ({
            stateId: l.stateId,
            name: l.name,
            slug: l.slug,
            code: l.code,
            zone: l.zone,
            centreLat: l.centreLat,
            centreLon: l.centreLon,
            boundaryGeojson: l.simplified,
            geom: geomSql(l.geometry),
          })),
        )
        .onConflictDoUpdate({
          target: lgas.code,
          set: {
            stateId: sql`excluded.state_id`,
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            zone: sql`excluded.zone`,
            centreLat: sql`excluded.centre_lat`,
            centreLon: sql`excluded.centre_lon`,
            boundaryGeojson: sql`excluded.boundary_geojson`,
            geom: sql`excluded.geom`,
          },
        });
    }

    // ── derived, DB-free copies of the simplified layers ──────────────────
    const derivedDir = path.join(root, "data", "derived");
    mkdirSync(derivedDir, { recursive: true });
    const stateFc = {
      type: "FeatureCollection",
      features: stateRows.map((s) => ({
        type: "Feature",
        properties: { slug: s.slug, name: s.meta.name, code: s.meta.code, zone: s.meta.zone },
        geometry: s.simplified,
      })),
    };
    const lgaFc = {
      type: "FeatureCollection",
      features: lgaRows.map((l) => ({
        type: "Feature",
        properties: { slug: l.slug, name: l.name, code: l.code, state: l.stateSlug, zone: l.zone },
        geometry: l.simplified,
      })),
    };
    writeFileSync(path.join(derivedDir, "states-simplified.geojson"), JSON.stringify(stateFc));
    writeFileSync(path.join(derivedDir, "lgas-simplified.geojson"), JSON.stringify(lgaFc));

    const [{ invalid }] = (
      await db.execute<{ invalid: number }>(
        sql`select count(*)::int as invalid from lgas where geom is null or not ST_IsValid(geom)`,
      )
    ).rows;
    if (invalid) warn(`${invalid} LGA geometries are null/invalid`);

    return {
      states: stateRows.length,
      lgas: lgaRows.length,
      parentFallbacks: fallbacks,
      invalidGeoms: invalid,
      lgaLayerKB: Math.round(collectionBytes(lgaRows.map((l) => l.simplified)) / 1024),
      stateLayerKB: Math.round(collectionBytes(stateRows.map((s) => s.simplified)) / 1024),
    };
  },
};
