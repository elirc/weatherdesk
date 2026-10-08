import { sql } from "drizzle-orm";
import { gridCells, lgas } from "@/db/schema";
import { gridCentre, gridIdx } from "@/lib/geo/zones";
import type { SeedStep } from "../lib/seed-types";

/**
 * One permanent 0.1° grid cell per LGA centre (origin 'lga', active). Several
 * LGAs can share a cell (dense Lagos/Kano LGAs). Sets lgas.grid_cell_id.
 * An existing on-demand cell that an LGA centre falls in is promoted to 'lga'.
 */
export const step: SeedStep = {
  name: "grid",
  async run({ db }) {
    const rows = await db
      .select({ id: lgas.id, lat: lgas.centreLat, lon: lgas.centreLon })
      .from(lgas);
    if (!rows.length) throw new Error("no LGAs — run step 10 first");

    const keyOf = (latIdx: number, lonIdx: number) => `${latIdx}:${lonIdx}`;
    const cells = new Map<string, { latIdx: number; lonIdx: number }>();
    const lgaCell = rows.map((r) => {
      const latIdx = gridIdx(r.lat);
      const lonIdx = gridIdx(r.lon);
      const key = keyOf(latIdx, lonIdx);
      cells.set(key, { latIdx, lonIdx });
      return { lgaId: r.id, key };
    });

    const values = [...cells.values()].map((c) => ({
      latIdx: c.latIdx,
      lonIdx: c.lonIdx,
      centreLat: gridCentre(c.latIdx),
      centreLon: gridCentre(c.lonIdx),
      active: true,
      origin: "lga",
    }));
    for (let i = 0; i < values.length; i += 500) {
      await db
        .insert(gridCells)
        .values(values.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [gridCells.latIdx, gridCells.lonIdx],
          set: { active: true, origin: "lga" },
        });
    }

    const dbCells = await db
      .select({ id: gridCells.id, latIdx: gridCells.latIdx, lonIdx: gridCells.lonIdx })
      .from(gridCells);
    const cellId = new Map(dbCells.map((c) => [keyOf(c.latIdx, c.lonIdx), c.id]));

    const pairs = lgaCell.map((l) => sql`(${l.lgaId}::int, ${cellId.get(l.key)!}::int)`);
    for (let i = 0; i < pairs.length; i += 400) {
      await db.execute(sql`
        update lgas set grid_cell_id = v.cell_id
        from (values ${sql.join(pairs.slice(i, i + 400), sql`, `)}) as v(lga_id, cell_id)
        where lgas.id = v.lga_id and lgas.grid_cell_id is distinct from v.cell_id`);
    }

    const [{ missing }] = (
      await db.execute<{ missing: number }>(
        sql`select count(*)::int as missing from lgas where grid_cell_id is null`,
      )
    ).rows;
    if (missing) throw new Error(`${missing} LGAs without a grid cell`);

    return { lgaCells: cells.size, totalCells: dbCells.length, lgasLinked: rows.length };
  },
};
