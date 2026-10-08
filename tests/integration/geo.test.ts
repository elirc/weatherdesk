import "dotenv/config";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SeedContext } from "../../scripts/lib/seed-types";
import { truncateAll } from "./setup";

/**
 * Seeds geography (steps 10 geography, 20 grid, 30 settlements) into the TEST database
 * and checks the invariants pages rely on. Orchestrator-run only (serial).
 *
 * setup.ts points DATABASE_URL at TEST_DATABASE_URL before this file loads;
 * dotenv does not override it (dotenv only supplies BETTER_AUTH_SECRET etc.).
 */

type DbModule = typeof import("@/db");
let dbm: DbModule;

beforeAll(async () => {
  await truncateAll();
  dbm = await import("@/db");
  const ctx: SeedContext = {
    db: dbm.db,
    pool: dbm.pool,
    mode: "mock",
    root: path.resolve(__dirname, "../.."),
    log: () => {},
    warn: () => {},
  };
  for (const file of ["10-geography", "20-grid", "30-settlements"]) {
    const mod = (await import(`../../scripts/seed-steps/${file}`)) as {
      step: { run: (c: SeedContext) => Promise<unknown> };
    };
    await mod.step.run(ctx);
  }
}, 300_000);

afterAll(async () => {
  await dbm?.pool.end();
});

async function one<T>(text: string): Promise<T> {
  const res = await dbm.pool.query(text);
  return res.rows[0] as T;
}

describe("geography seed", () => {
  it("loads 37 states and 774 LGAs", async () => {
    const r = await one<{ s: number; l: number }>(
      `select (select count(*) from states)::int s, (select count(*) from lgas)::int l`,
    );
    expect(r).toEqual({ s: 37, l: 774 });
  });

  it("every LGA has a state, a grid cell and a valid MultiPolygon geom", async () => {
    const r = await one<{ bad: number }>(`
      select count(*)::int bad from lgas l
      left join states s on s.id = l.state_id
      left join grid_cells g on g.id = l.grid_cell_id
      where s.id is null or g.id is null or l.geom is null
         or not ST_IsValid(l.geom) or GeometryType(l.geom) <> 'MULTIPOLYGON'
         or ST_SRID(l.geom) <> 4326`);
    expect(r.bad).toBe(0);
  });

  it("LGA centres lie inside their own LGA and their grid cell", async () => {
    const r = await one<{ bad: number }>(`
      select count(*)::int bad from lgas l join grid_cells g on g.id = l.grid_cell_id
      where g.lat_idx <> floor(l.centre_lat * 10) or g.lon_idx <> floor(l.centre_lon * 10)
         or not ST_Intersects(l.geom, ST_SetSRID(ST_MakePoint(l.centre_lon, l.centre_lat), 4326))`);
    expect(r.bad).toBe(0);
  });

  it("per-state LGA counts match the official numbers", async () => {
    const res = await dbm.pool.query<{ name: string; n: number }>(
      `select s.name, count(*)::int n from lgas l join states s on s.id = l.state_id group by s.name`,
    );
    const per = Object.fromEntries(res.rows.map((r) => [r.name, r.n]));
    expect(per["Kano"]).toBe(44);
    expect(per["Lagos"]).toBe(20);
    expect(per["Federal Capital Territory"]).toBe(6);
    expect(Object.keys(per)).toHaveLength(37);
  });

  it("slugs are unique and duplicated names carry the state suffix", async () => {
    const res = await dbm.pool.query<{ slug: string }>(
      `select slug from lgas where name in ('Surulere','Obi') order by slug`,
    );
    expect(res.rows.map((r) => r.slug)).toEqual([
      "obi-benue",
      "obi-nasarawa",
      "surulere-lagos",
      "surulere-oyo",
    ]);
  });

  it("is idempotent: re-running geography keeps ids and counts", async () => {
    const before = await one<{ ids: string }>(`select string_agg(id::text, ',' order by code) ids from lgas`);
    const mod = await import("../../scripts/seed-steps/10-geography");
    await mod.step.run({
      db: dbm.db,
      pool: dbm.pool,
      mode: "mock",
      root: path.resolve(__dirname, "../.."),
      log: () => {},
      warn: () => {},
    });
    const after = await one<{ ids: string }>(`select string_agg(id::text, ',' order by code) ids from lgas`);
    expect(after.ids).toBe(before.ids);
  }, 120_000);

  it("every settlement is inside (or nearest to) an LGA of its state", async () => {
    const r = await one<{ n: number; outside: number }>(`
      select count(*)::int n,
             count(*) filter (where not ST_DWithin(l.geom::geography,
               ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography, 5000))::int outside
      from settlements t join lgas l on l.id = t.lga_id`);
    expect(r.n).toBeGreaterThanOrEqual(300);
    expect(r.outside).toBe(0);
  });
});

describe("geo lookups", () => {
  it("pointToLga finds Ikeja and rejects the Atlantic", async () => {
    const { pointToLga } = await import("@/lib/geo/lookup");
    const hit = await pointToLga(6.6018, 3.3515);
    expect(hit?.lgaName).toBe("Ikeja");
    expect(hit?.stateSlug).toBe("lagos");
    expect(await pointToLga(3.0, 3.0)).toBeNull();
  });

  it("ensureGridCell reuses LGA cells and creates on-demand cells once", async () => {
    const { ensureGridCell } = await import("@/lib/geo/lookup");
    const lgaCell = await ensureGridCell(6.6018, 3.3515);
    expect(lgaCell.created).toBe(false);
    expect(lgaCell.origin).toBe("lga");
    const a = await ensureGridCell(13.45, 14.05); // Lake Chad: no LGA centre in cell 134/140
    const b = await ensureGridCell(13.46, 14.06);
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(false);
    expect(a.origin).toBe("on_demand");
    await expect(ensureGridCell(0, 0)).rejects.toThrow(RangeError);
  });

  it("lgaBySlug / stateBySlug / settlementById join their parents", async () => {
    const { lgaBySlug, settlementById, stateBySlug } = await import("@/lib/geo/lookup");
    const lga = await lgaBySlug("ikeja");
    expect(lga?.state.slug).toBe("lagos");
    expect(lga?.boundaryGeojson.type).toMatch(/Polygon/);
    expect((await stateBySlug("federal-capital-territory"))?.code).toBe("NG-FC");
    const { id } = await one<{ id: number }>(`select id from settlements where name = 'Zaria'`);
    const s = await settlementById(id);
    expect(s?.state.slug).toBe("kaduna");
    expect(s?.lga.name).toBe("Zaria");
    expect(await lgaBySlug("nowhere")).toBeNull();
  });

  it("searchPlaces ranks exact names first and tolerates typos", async () => {
    const { searchPlaces } = await import("@/lib/geo/search");
    const kaduna = await searchPlaces("Kaduna", 10);
    expect(kaduna[0]).toMatchObject({ kind: "state", slug: "kaduna" });
    expect(kaduna.some((h) => h.kind === "lga" && h.slug === "kaduna-north")).toBe(true);
    const typo = await searchPlaces("Onitcha", 5);
    expect(typo.some((h) => h.kind === "settlement" && h.name === "Onitsha")).toBe(true);
    expect(await searchPlaces("a")).toEqual([]);
    expect(await searchPlaces("100%_")).toEqual([]);
  });

  it("simplified collections are complete and cached", async () => {
    const { getNationalLgaCollection, getStatesCollection } = await import("@/lib/geo/simplified");
    const lgas = await getNationalLgaCollection();
    expect(lgas.features).toHaveLength(774);
    expect(Buffer.byteLength(JSON.stringify(lgas))).toBeLessThan(1.5 * 1024 * 1024);
    expect(await getNationalLgaCollection()).toBe(lgas);
    const states = await getStatesCollection();
    expect(states.features).toHaveLength(37);
    expect(states.features[0].properties).toHaveProperty("slug");
  });
});
