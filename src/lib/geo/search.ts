import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PlaceRef } from "@/lib/weather/types";
import {
  escapeLike,
  FCT_ALIASES,
  matchKey,
  normaliseQuery,
  SEARCH_MAX_LIMIT,
  SEARCH_MIN_CHARS,
} from "./query-text";

/**
 * Place search across states, LGAs and settlements (pg_trgm). Ranking:
 * exact name 1.0 → prefix 0.9 → substring 0.7 → trigram similarity; ties go
 * state > LGA > settlement, then shorter name. Typo-tolerant ("kadun",
 * "onitcha") via the `%` operator / similarity().
 */

export type PlaceSearchHit = {
  kind: "state" | "lga" | "settlement";
  id: number;
  /** states + LGAs have page slugs; settlements are addressed by id */
  slug: string | null;
  name: string;
  /** human context line: "Kaduna State", "Chikun LGA, Kaduna" */
  context: string;
  lat: number;
  lon: number;
  stateSlug: string;
  lgaSlug: string | null;
  score: number;
  ref: PlaceRef;
};

export { SEARCH_MAX_LIMIT, SEARCH_MIN_CHARS, escapeLike, normaliseQuery };

/** trigram similarity floor for fuzzy-only matches */
const SIM_FLOOR = 0.3;

type Row = {
  kind: "state" | "lga" | "settlement";
  id: number;
  slug: string | null;
  name: string;
  context: string;
  lat: number;
  lon: number;
  state_slug: string;
  lga_slug: string | null;
  score: number;
};

export async function searchPlaces(rawQuery: string, limit = 10): Promise<PlaceSearchHit[]> {
  const q = normaliseQuery(rawQuery);
  if (q.length < SEARCH_MIN_CHARS) return [];
  const n = Math.max(1, Math.min(SEARCH_MAX_LIMIT, Math.floor(limit)));
  // raw-name ILIKE for settlements keeps the gin_trgm index usable at GRID3 scale
  const like = `%${escapeLike(q)}%`;

  // punctuation-insensitive form: "Port-Harcourt" ≡ "port harcourt", "Jema'a" ≡ "jemaa"
  const qn = matchKey(q);
  const qnLike = `%${qn}%`;
  const qnPrefix = `${qn}%`;
  const norm = (col: ReturnType<typeof sql.raw>) =>
    sql`trim(regexp_replace(regexp_replace(lower(${col}), '[''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))`;
  const score = (col: ReturnType<typeof sql.raw>) => sql`
    case
      when ${norm(col)} = ${qn} then 1.0
      when ${norm(col)} like ${qnPrefix} then 0.9
      when ${norm(col)} like ${qnLike} then 0.7
      else similarity(${col}, ${q}) * 0.8
    end`;
  const fctAlias = FCT_ALIASES.has(qn);

  const res = await db.execute<Row>(sql`
    select * from (
      select 'state'::text as kind, s.id, s.slug, s.name,
             s.name || ' State' as context,
             s.centre_lat as lat, s.centre_lon as lon,
             s.slug as state_slug, null::text as lga_slug,
             case when ${fctAlias} and s.code = 'NG-FC' then 0.95
                  else ${score(sql.raw("s.name"))} end as score,
             0 as kind_rank
      from states s
      where ${norm(sql.raw("s.name"))} like ${qnLike}
         or similarity(s.name, ${q}) > ${SIM_FLOOR}
         or (${fctAlias} and s.code = 'NG-FC')
      union all
      select 'lga', l.id, l.slug, l.name,
             l.name || ' LGA, ' || s.name,
             l.centre_lat, l.centre_lon,
             s.slug, l.slug,
             ${score(sql.raw("l.name"))}, 1
      from lgas l join states s on s.id = l.state_id
      where ${norm(sql.raw("l.name"))} like ${qnLike} or similarity(l.name, ${q}) > ${SIM_FLOOR}
      union all
      select 'settlement', t.id, null, t.name,
             l.name || ' LGA, ' || s.name,
             t.lat, t.lon,
             s.slug, l.slug,
             ${score(sql.raw("t.name"))}, 2
      from settlements t
      join lgas l on l.id = t.lga_id
      join states s on s.id = l.state_id
      where t.name ilike ${like} or t.name % ${q}
    ) hits
    order by score desc, kind_rank, length(name), name
    limit ${n}`);

  return res.rows.map((r) => {
    const ref: PlaceRef =
      r.kind === "settlement"
        ? { kind: "settlement", id: r.id, name: r.name }
        : { kind: r.kind, id: r.id, slug: r.slug!, name: r.name };
    return {
      kind: r.kind,
      id: r.id,
      slug: r.slug,
      name: r.name,
      context: r.context,
      lat: r.lat,
      lon: r.lon,
      stateSlug: r.state_slug,
      lgaSlug: r.lga_slug,
      score: Math.round(Number(r.score) * 1000) / 1000,
      ref,
    };
  });
}
