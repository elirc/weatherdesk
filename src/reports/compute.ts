import { and, asc, between, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accuracyStats,
  alerts,
  customAreas,
  forecastArchive,
  forecastDaily,
  lgas,
  normalsMonthly,
  normalsSeason,
  observedDaily,
  states,
} from "@/db/schema";
import { getNationalLgaCollection } from "@/lib/geo/simplified";
import type { AreaGeometry } from "@/lib/geo/types";
import { ZONE_LABELS, ZONES, type Zone } from "@/lib/geo/zones";
import { classifyNormalBand, detectOnset, percentOfNormal, type DailyRain } from "@/lib/weather/calc";
import { RAINY_DAY_MM } from "@/lib/weather/constants";
import { addDaysIso, dayOfYear, lagosMidnightUtc } from "@/lib/time";
import type { ReportContent, ReportExtremes, ReportOutlookDay, ReportTableRow } from "./content-types";
import { dayWeightedNormal, mean, monthOverlaps, nextMonth, proRatedRainNormal, resolvePeriod, round1 } from "./math";
import {
  accuracyText,
  comingMonthText,
  formatPeriodLabel,
  headline,
  NORMALS_LABEL,
  outlookText,
  seasonStatus,
} from "./narrative";
import { buildMapModel, renderMapSvg, type MapFeatureInput } from "./svg-maps";
import type { ScaleKind } from "./scales";

/**
 * Report computation: observed_daily → grid cells → LGAs → states.
 *
 * Every LGA is represented by its grid cell (lgas.grid_cell_id, the 0.1° cell
 * at the LGA centre). Area figures (national / state / custom area) are the
 * mean over the UNIQUE cells in the area, so LGAs sharing a cell are not
 * double-counted. % of normal for an area is mean(rain) / mean(normal) over
 * the cells that have rain data.
 */

export const DISCLAIMER = "Independent service — not affiliated with NiMet. Advisories are not official warnings.";

export const REPORT_SOURCES = [
  "Observed daily rainfall and temperature: NASA POWER (final) and Open-Meteo model estimates (preliminary).",
  "Forecasts: Open-Meteo.",
  `Climate normals: ${NORMALS_LABEL}, computed from NASA POWER daily data.`,
  "Boundaries: geoBoundaries / GRID3. Map data © OpenStreetMap contributors.",
  DISCLAIMER,
];

export type ScopeUnit = {
  lgaId: number;
  lgaName: string;
  lgaSlug: string;
  stateId: number;
  stateName: string;
  stateSlug: string;
  zone: Zone;
  cellId: number;
};

export type ResolvedScope = {
  scopeType: "national" | "state" | "custom_area";
  scopeKey: string;
  label: string;
  stateId: number | null;
  customAreaId: string | null;
  /** owner org of a custom area (area reports are always org-scoped) */
  areaOrganizationId: string | null;
  units: ScopeUnit[];
};

const unitSelect = {
  lgaId: lgas.id,
  lgaName: lgas.name,
  lgaSlug: lgas.slug,
  stateId: states.id,
  stateName: states.name,
  stateSlug: states.slug,
  zone: lgas.zone,
  cellId: lgas.gridCellId,
};

type UnitRow = Omit<ScopeUnit, "cellId"> & { cellId: number | null };

function withCell(rows: UnitRow[]): ScopeUnit[] {
  return rows.filter((r): r is ScopeUnit => r.cellId != null);
}

export function parseScopeKey(scopeKey: string): { kind: "national" } | { kind: "state"; id: number } | { kind: "area"; id: string } {
  if (scopeKey === "national") return { kind: "national" };
  const m = /^state:(\d+)$/.exec(scopeKey);
  if (m) return { kind: "state", id: Number(m[1]) };
  const a = /^area:(.+)$/.exec(scopeKey);
  if (a) return { kind: "area", id: a[1] };
  throw new Error(`invalid scopeKey '${scopeKey}'`);
}

export async function resolveScope(scopeKey: string): Promise<ResolvedScope> {
  const parsed = parseScopeKey(scopeKey);
  if (parsed.kind === "national") {
    const rows = await db.select(unitSelect).from(lgas).innerJoin(states, eq(states.id, lgas.stateId)).orderBy(asc(lgas.id));
    return {
      scopeType: "national",
      scopeKey,
      label: "Nigeria",
      stateId: null,
      customAreaId: null,
      areaOrganizationId: null,
      units: withCell(rows),
    };
  }
  if (parsed.kind === "state") {
    const [st] = await db.select({ id: states.id, name: states.name }).from(states).where(eq(states.id, parsed.id));
    if (!st) throw new Error(`unknown state ${parsed.id}`);
    const rows = await db
      .select(unitSelect)
      .from(lgas)
      .innerJoin(states, eq(states.id, lgas.stateId))
      .where(eq(lgas.stateId, st.id))
      .orderBy(asc(lgas.name));
    return {
      scopeType: "state",
      scopeKey,
      label: st.name,
      stateId: st.id,
      customAreaId: null,
      areaOrganizationId: null,
      units: withCell(rows),
    };
  }
  const [area] = await db.select().from(customAreas).where(eq(customAreas.id, parsed.id));
  if (!area) throw new Error(`unknown custom area ${parsed.id}`);
  let rows: UnitRow[] = [];
  if (area.mode === "lga_set") {
    const ids = area.lgaIds ?? [];
    rows = ids.length
      ? await db
          .select(unitSelect)
          .from(lgas)
          .innerJoin(states, eq(states.id, lgas.stateId))
          .where(inArray(lgas.id, ids))
          .orderBy(asc(lgas.name))
      : [];
  } else {
    // Polygon: grid cells whose CENTRE falls inside the polygon, each labelled
    // with the LGA containing that centre (PostGIS → raw sql, per conventions).
    const res = await db.execute<{ cell_id: number; lga_id: number }>(sql`
      select gc.id as cell_id, l.id as lga_id
      from custom_areas ca
      join grid_cells gc
        on ST_Intersects(ca.geom, ST_SetSRID(ST_MakePoint(gc.centre_lon, gc.centre_lat), 4326))
      join lateral (
        select l.id from lgas l
        where ST_Contains(l.geom, ST_SetSRID(ST_MakePoint(gc.centre_lon, gc.centre_lat), 4326))
        limit 1
      ) l on true
      where ca.id = ${area.id}`);
    const pairs = res.rows;
    if (pairs.length) {
      const lgaRows = await db
        .select(unitSelect)
        .from(lgas)
        .innerJoin(states, eq(states.id, lgas.stateId))
        .where(inArray(lgas.id, [...new Set(pairs.map((p) => Number(p.lga_id)))]));
      const byId = new Map(lgaRows.map((r) => [r.lgaId, r]));
      rows = pairs.flatMap((p) => {
        const l = byId.get(Number(p.lga_id));
        return l ? [{ ...l, cellId: Number(p.cell_id) }] : [];
      });
    } else {
      // polygon smaller than a cell: fall back to intersecting LGAs' own cells
      const res2 = await db.execute<{ id: number }>(
        sql`select l.id from lgas l join custom_areas ca on ST_Intersects(l.geom, ca.geom) where ca.id = ${area.id}`,
      );
      const ids = res2.rows.map((r) => Number(r.id));
      rows = ids.length
        ? await db.select(unitSelect).from(lgas).innerJoin(states, eq(states.id, lgas.stateId)).where(inArray(lgas.id, ids))
        : [];
    }
  }
  return {
    scopeType: "custom_area",
    scopeKey,
    label: area.name,
    stateId: null,
    customAreaId: area.id,
    areaOrganizationId: area.organizationId,
    units: withCell(rows),
  };
}

/* ------------------------------------------------------------------ */
/* per-cell aggregation                                               */
/* ------------------------------------------------------------------ */

export type CellStats = {
  cellId: number;
  rainMm: number | null;
  rainNormalMm: number | null;
  rainyDays: number | null;
  meanTmaxC: number | null;
  tmaxNormalC: number | null;
  maxTmaxC: number | null;
  preliminary: boolean;
};

async function cellStats(cellIds: number[], start: string, end: string): Promise<Map<number, CellStats>> {
  const nDays = monthOverlaps(start, end).reduce((s, o) => s + o.days, 0);
  const obs = await db
    .select({
      cell: observedDaily.gridCellId,
      rain: sql<number | null>`sum(${observedDaily.rainMm})::float8`,
      nRain: sql<number>`count(${observedDaily.rainMm})::int`,
      rainy: sql<number>`(count(*) filter (where ${observedDaily.rainMm} >= ${RAINY_DAY_MM}))::int`,
      tmax: sql<number | null>`avg(${observedDaily.tmaxC})::float8`,
      tmaxMax: sql<number | null>`max(${observedDaily.tmaxC})::float8`,
      prelim: sql<boolean>`bool_or(${observedDaily.preliminary})`,
    })
    .from(observedDaily)
    .where(and(inArray(observedDaily.gridCellId, cellIds), between(observedDaily.date, start, end)))
    .groupBy(observedDaily.gridCellId);

  const months = [...new Set(monthOverlaps(start, end).map((o) => o.month))];
  const normals = await db
    .select({ cell: normalsMonthly.gridCellId, month: normalsMonthly.month, rain: normalsMonthly.rainMm, tmax: normalsMonthly.tmaxC })
    .from(normalsMonthly)
    .where(and(inArray(normalsMonthly.gridCellId, cellIds), inArray(normalsMonthly.month, months)));
  const nByCell = new Map<number, Map<number, { rain: number | null; tmax: number | null }>>();
  for (const n of normals) {
    if (!nByCell.has(n.cell)) nByCell.set(n.cell, new Map());
    nByCell.get(n.cell)!.set(n.month, { rain: n.rain, tmax: n.tmax });
  }

  const out = new Map<number, CellStats>();
  for (const o of obs) {
    const nm = nByCell.get(o.cell);
    // a period total needs at least half its days observed, else it would read as "dry"
    const enough = o.nRain * 2 >= nDays;
    out.set(o.cell, {
      cellId: o.cell,
      rainMm: enough ? o.rain : null,
      rainNormalMm: nm ? proRatedRainNormal(start, end, (m) => nm.get(m)?.rain ?? null) : null,
      rainyDays: enough ? o.rainy : null,
      meanTmaxC: o.tmax,
      tmaxNormalC: nm ? dayWeightedNormal(start, end, (m) => nm.get(m)?.tmax ?? null) : null,
      maxTmaxC: o.tmaxMax,
      preliminary: o.prelim,
    });
  }
  return out;
}

type AreaAgg = {
  rainMm: number | null;
  rainPctOfNormal: number | null;
  meanTmaxC: number | null;
  tmaxAnomalyC: number | null;
  rainyDays: number | null;
};

/** Mean over unique cells (see module comment). */
export function aggregateCells(cells: CellStats[]): AreaAgg {
  const withRain = cells.filter((c) => c.rainMm != null);
  const rain = mean(withRain.map((c) => c.rainMm));
  const rainNormal = mean(withRain.map((c) => c.rainNormalMm));
  const withT = cells.filter((c) => c.meanTmaxC != null && c.tmaxNormalC != null);
  const tmaxAll = mean(cells.map((c) => c.meanTmaxC));
  const anomaly = withT.length ? (mean(withT.map((c) => c.meanTmaxC))! - mean(withT.map((c) => c.tmaxNormalC))!) : null;
  return {
    rainMm: round1(rain),
    rainPctOfNormal: rain == null || rainNormal == null ? null : percentOfNormal(rain, rainNormal),
    meanTmaxC: round1(tmaxAll),
    tmaxAnomalyC: round1(anomaly),
    rainyDays: round1(mean(withRain.map((c) => c.rainyDays))),
  };
}

function uniqueCells(units: ScopeUnit[], stats: Map<number, CellStats>): CellStats[] {
  const seen = new Set<number>();
  const out: CellStats[] = [];
  for (const u of units) {
    if (seen.has(u.cellId)) continue;
    seen.add(u.cellId);
    const s = stats.get(u.cellId);
    if (s) out.push(s);
  }
  return out;
}

export function topExtremes(
  units: ScopeUnit[],
  stats: Map<number, CellStats>,
  nameOf: (u: ScopeUnit) => string,
  n = 3,
): ReportExtremes {
  const seen = new Set<number>();
  const rows: { name: string; rain: number | null; tmax: number | null }[] = [];
  for (const u of units) {
    if (seen.has(u.cellId)) continue; // LGAs sharing a cell would repeat the same value
    seen.add(u.cellId);
    const s = stats.get(u.cellId);
    if (s) rows.push({ name: nameOf(u), rain: s.rainMm, tmax: s.maxTmaxC });
  }
  const rainRows = rows.filter((r) => r.rain != null) as { name: string; rain: number }[];
  const tRows = rows.filter((r) => r.tmax != null) as { name: string; tmax: number }[];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    wettest: [...rainRows].sort((a, b) => b.rain - a.rain || byName(a, b)).slice(0, n).map((r) => ({ name: r.name, valueMm: round1(r.rain)! })),
    driest: [...rainRows].sort((a, b) => a.rain - b.rain || byName(a, b)).slice(0, n).map((r) => ({ name: r.name, valueMm: round1(r.rain)! })),
    hottest: [...tRows].sort((a, b) => b.tmax - a.tmax || byName(a, b)).slice(0, n).map((r) => ({ name: r.name, valueC: round1(r.tmax)! })),
  };
}

function tableRow(name: string, slug: string | undefined, agg: AreaAgg): ReportTableRow {
  return {
    name,
    ...(slug ? { slug } : {}),
    rainMm: agg.rainMm,
    rainPctOfNormal: agg.rainPctOfNormal,
    band: classifyNormalBand(agg.rainPctOfNormal),
    meanTmaxC: agg.meanTmaxC,
    tmaxAnomalyC: agg.tmaxAnomalyC,
  };
}

/* ------------------------------------------------------------------ */
/* extras                                                             */
/* ------------------------------------------------------------------ */

async function alertCounts(lgaIds: number[], start: string, end: string) {
  if (!lgaIds.length) return [];
  const rows = await db
    .select({ type: alerts.type, count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(
      and(
        inArray(alerts.lgaId, lgaIds),
        gte(alerts.validFrom, lagosMidnightUtc(start)),
        lt(alerts.validFrom, lagosMidnightUtc(addDaysIso(end, 1))),
      ),
    )
    .groupBy(alerts.type);
  return rows.map((r) => ({ type: r.type as string, count: r.count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * Next-7-days outlook after the period, area-averaged. Uses the live
 * forecast_daily run where it covers a day; for days it no longer covers
 * (reports generated after the fact, e.g. seed backfill) it falls back to
 * the archived forecast issued on or before the period end (shortest lead).
 */
async function outlookDays(cellIds: number[], periodEnd: string): Promise<ReportOutlookDay[]> {
  const from = addDaysIso(periodEnd, 1);
  const to = addDaysIso(periodEnd, 7);
  const live = await db
    .select({
      date: forecastDaily.date,
      rain: sql<number | null>`avg(${forecastDaily.rainMm})::float8`,
      tmax: sql<number | null>`avg(${forecastDaily.tmaxC})::float8`,
    })
    .from(forecastDaily)
    .where(and(inArray(forecastDaily.gridCellId, cellIds), between(forecastDaily.date, from, to)))
    .groupBy(forecastDaily.date);
  const byDate = new Map<string, ReportOutlookDay>();
  for (const r of live) byDate.set(r.date, { date: r.date, rainMm: round1(r.rain), tmaxC: round1(r.tmax) });
  if (byDate.size < 7) {
    const latest = db
      .selectDistinctOn([forecastArchive.gridCellId, forecastArchive.targetDate], {
        cell: forecastArchive.gridCellId,
        target: forecastArchive.targetDate,
        rain: forecastArchive.rainMm,
        tmax: forecastArchive.tmaxC,
      })
      .from(forecastArchive)
      .where(
        and(
          inArray(forecastArchive.gridCellId, cellIds),
          between(forecastArchive.targetDate, from, to),
          lte(forecastArchive.issueDate, periodEnd),
        ),
      )
      .orderBy(forecastArchive.gridCellId, forecastArchive.targetDate, sql`${forecastArchive.issueDate} desc`)
      .as("latest");
    const arch = await db
      .select({
        date: latest.target,
        rain: sql<number | null>`avg(${latest.rain})::float8`,
        tmax: sql<number | null>`avg(${latest.tmax})::float8`,
      })
      .from(latest)
      .groupBy(latest.target);
    for (const r of arch) {
      if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, rainMm: round1(r.rain), tmaxC: round1(r.tmax) });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Season progress by zone: share of cells whose rainy-season onset (agronomic
 * definition, detectOnset from 1 February) has occurred by the period end,
 * vs the share whose 1991–2020 median onset falls on or before that day.
 */
async function seasonProgress(units: ScopeUnit[], periodEnd: string): Promise<{ zone: string; status: string }[]> {
  const year = periodEnd.slice(0, 4);
  const cellZone = new Map<number, Zone>();
  for (const u of units) if (!cellZone.has(u.cellId)) cellZone.set(u.cellId, u.zone);
  const cellIds = [...cellZone.keys()];
  if (!cellIds.length) return [];
  const series = await db
    .select({ cell: observedDaily.gridCellId, date: observedDaily.date, rain: observedDaily.rainMm })
    .from(observedDaily)
    .where(and(inArray(observedDaily.gridCellId, cellIds), between(observedDaily.date, `${year}-01-01`, periodEnd)))
    .orderBy(observedDaily.gridCellId, observedDaily.date);
  const byCell = new Map<number, DailyRain[]>();
  for (const r of series) {
    if (!byCell.has(r.cell)) byCell.set(r.cell, []);
    byCell.get(r.cell)!.push({ date: r.date, rainMm: r.rain });
  }
  const normals = await db
    .select({ cell: normalsSeason.gridCellId, onset: normalsSeason.onsetDoy })
    .from(normalsSeason)
    .where(inArray(normalsSeason.gridCellId, cellIds));
  const normalOnset = new Map(normals.map((n) => [n.cell, n.onset]));
  const endDoy = dayOfYear(periodEnd);

  const perZone = new Map<Zone, { n: number; occurred: number; nNormal: number; normalBy: number }>();
  for (const [cell, zone] of cellZone) {
    const z = perZone.get(zone) ?? { n: 0, occurred: 0, nNormal: 0, normalBy: 0 };
    const s = byCell.get(cell);
    if (s && s.length) {
      z.n += 1;
      const onset = detectOnset(s, `${year}-02-01`);
      if (onset && onset <= periodEnd) z.occurred += 1;
    }
    const no = normalOnset.get(cell);
    if (no != null) {
      z.nNormal += 1;
      if (no <= endDoy) z.normalBy += 1;
    }
    perZone.set(zone, z);
  }
  return ZONES.filter((z) => perZone.has(z)).map((zone) => {
    const z = perZone.get(zone)!;
    const onsetPct = z.n ? Math.round((z.occurred / z.n) * 100) : null;
    const normalPct = z.nNormal ? Math.round((z.normalBy / z.nNormal) * 100) : null;
    return { zone: ZONE_LABELS[zone], status: seasonStatus(onsetPct, normalPct) };
  });
}

async function comingMonth(cellIds: number[], periodStart: string, scopeLabel: string) {
  const { month } = nextMonth(Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)));
  const rows = await db
    .select({ rain: normalsMonthly.rainMm, tmax: normalsMonthly.tmaxC })
    .from(normalsMonthly)
    .where(and(inArray(normalsMonthly.gridCellId, cellIds), eq(normalsMonthly.month, month)));
  return { text: comingMonthText(month, scopeLabel, round1(mean(rows.map((r) => r.rain))), round1(mean(rows.map((r) => r.tmax)))) };
}

function dominantZone(units: ScopeUnit[]): Zone | null {
  const counts = new Map<Zone, number>();
  for (const u of units) counts.set(u.zone, (counts.get(u.zone) ?? 0) + 1);
  let best: Zone | null = null;
  let bestN = 0;
  for (const [z, n] of counts) {
    if (n > bestN) {
      best = z;
      bestN = n;
    }
  }
  return best;
}

async function accuracy(scope: ResolvedScope, periodStart: string, periodLabel: string) {
  const zone = scope.scopeType === "national" ? "national" : (dominantZone(scope.units) ?? "national");
  const q = (z: string) =>
    db
      .select({ mae: accuracyStats.maeTmax, hit: accuracyStats.rainHitRate, n: accuracyStats.nSamples })
      .from(accuracyStats)
      .where(and(eq(accuracyStats.month, periodStart), eq(accuracyStats.zone, z), eq(accuracyStats.leadDays, 1)))
      .limit(1);
  let [row] = await q(zone);
  if (!row && zone !== "national") [row] = await q("national");
  const maeTmax = row?.mae == null ? null : Math.round(row.mae * 100) / 100;
  const rainHitRatePct = row?.hit == null ? null : Math.round(row.hit * 100);
  return { text: accuracyText(periodLabel, maeTmax, rainHitRatePct, row?.n ?? null), maeTmax, rainHitRatePct };
}

/* ------------------------------------------------------------------ */
/* maps                                                               */
/* ------------------------------------------------------------------ */

async function buildMaps(
  type: "weekly" | "monthly",
  scope: ResolvedScope,
  stats: Map<number, CellStats>,
  periodLabel: string,
): Promise<ReportContent["svgs"]> {
  const all = await getNationalLgaCollection();
  const unitByLga = new Map<number, ScopeUnit>();
  for (const u of scope.units) if (!unitByLga.has(u.lgaId)) unitByLga.set(u.lgaId, u);
  // For polygon areas several cells may map to one LGA: average them per LGA.
  const cellsByLga = new Map<number, CellStats[]>();
  for (const u of scope.units) {
    const s = stats.get(u.cellId);
    if (!s) continue;
    if (!cellsByLga.has(u.lgaId)) cellsByLga.set(u.lgaId, []);
    if (!cellsByLga.get(u.lgaId)!.includes(s)) cellsByLga.get(u.lgaId)!.push(s);
  }
  const aggByLga = new Map<number, AreaAgg>();
  for (const [lga, cells] of cellsByLga) aggByLga.set(lga, aggregateCells(cells));

  const inScope = all.features.filter((f) => unitByLga.has(f.properties.id));
  let context: AreaGeometry[] = [];
  if (scope.scopeType === "custom_area") {
    const stateSlugs = new Set(scope.units.map((u) => u.stateSlug));
    context = all.features
      .filter((f) => stateSlugs.has(f.properties.stateSlug) && !unitByLga.has(f.properties.id))
      .map((f) => f.geometry);
  }

  const subtitle = `${scope.label} · by LGA · ${periodLabel}`;
  const make = (key: string, title: string, legendTitle: string, scale: ScaleKind, pick: (a: AreaAgg | undefined) => number | null) => {
    const features: MapFeatureInput[] = inScope.map((f) => ({
      name: f.properties.name,
      geometry: f.geometry,
      value: pick(aggByLga.get(f.properties.id)),
    }));
    const model = buildMapModel({ title, subtitle, legendTitle, scale, features, context });
    return { key, title, svg: renderMapSvg(model) };
  };

  const svgs = [
    make("rain-total", "Rainfall total", "Rain (mm)", "rain", (a) => a?.rainMm ?? null),
    make("rain-pct-normal", "Rainfall as % of normal", `% of ${NORMALS_LABEL}`, "pct", (a) => a?.rainPctOfNormal ?? null),
  ];
  if (type === "monthly") {
    svgs.push(make("tmax-anomaly", "Max temperature vs normal", "Anomaly (°C)", "anomaly", (a) => a?.tmaxAnomalyC ?? null));
  }
  return svgs;
}

/* ------------------------------------------------------------------ */
/* entry                                                              */
/* ------------------------------------------------------------------ */

export type ComputedReport = {
  scope: ResolvedScope;
  periodStart: string;
  periodEnd: string;
  content: ReportContent;
};

export async function computeReport(input: {
  type: "weekly" | "monthly";
  scopeKey: string;
  periodStart: string;
}): Promise<ComputedReport> {
  const { start, end } = resolvePeriod(input.type, input.periodStart);
  const scope = await resolveScope(input.scopeKey);
  if (!scope.units.length) throw new Error(`scope ${input.scopeKey} has no LGAs with grid cells`);
  const cellIds = [...new Set(scope.units.map((u) => u.cellId))];
  const lgaIds = [...new Set(scope.units.map((u) => u.lgaId))];
  const periodLabel = formatPeriodLabel(input.type, start, end);

  const stats = await cellStats(cellIds, start, end);
  const overall = aggregateCells(uniqueCells(scope.units, stats));

  // table: by state for national, by LGA otherwise
  const rows: ReportTableRow[] = [];
  if (scope.scopeType === "national") {
    const byState = new Map<number, ScopeUnit[]>();
    for (const u of scope.units) {
      if (!byState.has(u.stateId)) byState.set(u.stateId, []);
      byState.get(u.stateId)!.push(u);
    }
    for (const us of byState.values()) rows.push(tableRow(us[0].stateName, us[0].stateSlug, aggregateCells(uniqueCells(us, stats))));
  } else {
    const byLga = new Map<number, ScopeUnit[]>();
    for (const u of scope.units) {
      if (!byLga.has(u.lgaId)) byLga.set(u.lgaId, []);
      byLga.get(u.lgaId)!.push(u);
    }
    for (const us of byLga.values()) rows.push(tableRow(us[0].lgaName, us[0].lgaSlug, aggregateCells(uniqueCells(us, stats))));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const nameOf =
    scope.scopeType === "national" || new Set(scope.units.map((u) => u.stateId)).size > 1
      ? (u: ScopeUnit) => `${u.lgaName}, ${u.stateName}`
      : (u: ScopeUnit) => u.lgaName;
  const extremes = topExtremes(scope.units, stats, nameOf);
  const alertsIssued = await alertCounts(lgaIds, start, end);
  const anyPrelim = [...stats.values()].some((s) => s.preliminary);

  const content: ReportContent = {
    version: 1,
    headline: headline({
      type: input.type,
      scopeLabel: scope.label,
      periodLabel,
      rainPctOfNormal: overall.rainPctOfNormal,
      tmaxAnomalyC: overall.tmaxAnomalyC,
    }),
    periodLabel,
    scopeLabel: scope.label,
    svgs: await buildMaps(input.type, scope, stats, periodLabel),
    stats: {
      rainTotalMm: overall.rainMm,
      rainPctOfNormal: overall.rainPctOfNormal,
      meanTmaxC: overall.meanTmaxC,
      tmaxAnomalyC: overall.tmaxAnomalyC,
      rainyDays: overall.rainyDays,
    },
    extremes,
    table: {
      rows,
      unitNote:
        "Rain: period total in mm (area mean). % of normal vs the 1991–2020 average for the same days. " +
        "Max temp: mean daily maximum in °C; anomaly vs the 1991–2020 normal.",
    },
    alertsIssued,
    methodsNote:
      `Values are area means over 0.1° grid cells at LGA centres (${cellIds.length} cells, ${lgaIds.length} LGAs). ` +
      (input.type === "weekly"
        ? "Weekly normals pro-rate each month's 1991–2020 normal by the number of days of the week falling in that month. "
        : "Monthly normals are the 1991–2020 average for the calendar month. ") +
      `Bands: below normal under 80%, near normal 80–120%, above normal over 120%. A rainy day has ${RAINY_DAY_MM.toFixed(0)} mm or more. ` +
      (anyPrelim ? "The most recent days include preliminary model estimates, replaced by NASA POWER data when available. " : "") +
      "All dates are Africa/Lagos (WAT). " +
      DISCLAIMER,
    sources: REPORT_SOURCES,
  };

  if (input.type === "weekly") {
    const days = await outlookDays(cellIds, end);
    content.outlook = { text: outlookText(scope.label, days), days };
  } else {
    content.seasonProgress = await seasonProgress(scope.units, end);
    content.comingMonth = await comingMonth(cellIds, start, scope.label);
    content.accuracy = await accuracy(scope, start, periodLabel);
  }
  return { scope, periodStart: start, periodEnd: end, content };
}
