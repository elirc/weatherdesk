import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { states } from "@/db/schema";
import { normaliseStateName } from "@/lib/geo/state-names";
import { parseCsv, toSettlementRows } from "../lib/csv";
import type { SeedStep } from "../lib/seed-types";

/**
 * Settlements for search + place pages.
 * Source preference: data/grid3/settlements.csv (operator-supplied GRID3
 * export, source 'grid3') → data/settlements/settlements-fixture.csv
 * (committed fixture, source 'fixture'). Same columns: name,state,lat,lon,kind.
 *
 * lga_id is assigned spatially with PostGIS: the LGA of the NAMED state whose
 * geom contains the point; if none does (coastal points in water, coordinates
 * just over a border) the nearest LGA of that state. Upsert keyed on
 * (name, source, state): corrected coordinates update the row in place. Rows
 * are referenced by saved_places, so they are
 * never deleted on re-seed.
 */

const BATCH = 500;

export const step: SeedStep = {
  name: "settlements",
  async run({ db, pool, root, log, warn }) {
    const grid3 = path.join(root, "data", "grid3", "settlements.csv");
    const fixture = path.join(root, "data", "settlements", "settlements-fixture.csv");
    const useGrid3 = existsSync(grid3);
    const file = useGrid3 ? grid3 : fixture;
    const source = useGrid3 ? "grid3" : "fixture";
    log(`source: ${path.relative(root, file)} (${source})`);

    const { rows, rejects } = toSettlementRows(parseCsv(readFileSync(file, "utf8")));
    for (const r of rejects.slice(0, 10)) warn(`rejected ${r}`);

    const stateRows = await db.select({ id: states.id, name: states.name }).from(states);
    if (!stateRows.length) throw new Error("no states — run step 10 first");
    const stateIdByName = new Map(stateRows.map((s) => [s.name, s.id]));

    let unknownState = 0;
    const resolved = rows.flatMap((r) => {
      const canonical = normaliseStateName(r.state);
      const stateId = canonical ? stateIdByName.get(canonical) : undefined;
      if (!stateId) {
        unknownState += 1;
        if (unknownState <= 10) warn(`unknown state "${r.state}" for ${r.name}`);
        return [];
      }
      return [{ ...r, stateId }];
    });

    let inserted = 0;
    let updated = 0;
    let contained = 0;
    let nearest = 0;
    for (let i = 0; i < resolved.length; i += BATCH) {
      const b = resolved.slice(i, i + BATCH);
      const res = await pool.query<{ name: string; inserted: boolean; contained: boolean; km: number; updated: number }>(
        `with input as (
           select * from unnest($1::text[], $2::int[], $3::float8[], $4::float8[], $5::text[])
             as t(name, state_id, lat, lon, kind)
         ),
         located as (
           select i.*, m.lga_id, m.contained, m.km
           from input i
           cross join lateral (
             select l.id as lga_id,
                    ST_Contains(l.geom, p.pt) as contained,
                    ST_Distance(l.geom::geography, p.pt::geography) / 1000 as km
             from lgas l,
                  (select ST_SetSRID(ST_MakePoint(i.lon, i.lat), 4326) as pt) p
             where l.state_id = i.state_id
             order by ST_Contains(l.geom, p.pt) desc, ST_Distance(l.geom, p.pt)
             limit 1
           ) m
         ),
         existing as (
           select s.id, x.name, x.state_id
           from located x
           join settlements s on s.name = x.name and s.source = $6
           join lgas ol on ol.id = s.lga_id and ol.state_id = x.state_id
         ),
         upd as (
           update settlements s
           set lat = x.lat, lon = x.lon, lga_id = x.lga_id, kind = nullif(x.kind, '')
           from existing e join located x on x.name = e.name and x.state_id = e.state_id
           where s.id = e.id
             and (s.lat, s.lon, s.lga_id, coalesce(s.kind, ''))
                 is distinct from (x.lat, x.lon, x.lga_id, x.kind)
           returning s.id
         ),
         ins as (
           insert into settlements (name, lga_id, lat, lon, kind, source)
           select x.name, x.lga_id, x.lat, x.lon, nullif(x.kind, ''), $6
           from located x
           where not exists (
             select 1 from existing e where e.name = x.name and e.state_id = x.state_id
           )
           returning name, lga_id
         )
         select x.name, x.contained, x.km,
                exists (select 1 from ins where ins.name = x.name and ins.lga_id = x.lga_id) as inserted,
                (select count(*) from upd)::int as updated
         from located x`,
        [
          b.map((r) => r.name),
          b.map((r) => r.stateId),
          b.map((r) => r.lat),
          b.map((r) => r.lon),
          b.map((r) => r.kind ?? ""),
          source,
        ],
      );
      updated += res.rows[0]?.updated ?? 0;
      for (const row of res.rows) {
        if (row.inserted) inserted += 1;
        if (row.contained) contained += 1;
        else {
          nearest += 1;
          if (row.km > 2) warn(`${row.name} lies ${row.km.toFixed(1)} km outside its state — check coordinates`);
        }
      }
    }

    const total = await pool.query<{ n: number }>(
      `select count(*)::int as n from settlements`,
    );
    return {
      source,
      rows: rows.length,
      inserted,
      updated,
      inPolygon: contained,
      nearestLgaFallback: nearest,
      unknownState,
      rejected: rejects.length,
      total: total.rows[0].n,
    };
  },
};
