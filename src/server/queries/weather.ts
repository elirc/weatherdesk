import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, forecastDaily, forecastHourly, gridCells, lgas, notices, states } from "@/db/schema";
import { gridIdx } from "@/lib/geo/zones";
import { addDaysIso, lagosToday } from "@/lib/time";
import { FORECAST_DAYS, HOURLY_HOURS } from "@/lib/weather/constants";

/**
 * Server-only forecast / alert / notice queries for the public site (A3).
 * Every row carries `source` + `fetchedAt` so components can render
 * provenance (CONVENTIONS rule 3). Pure SQL access only — caching is done by
 * the calling components with `use cache` (cacheComponents is enabled).
 */

// ── Types ──────────────────────────────────────────────────────────────

export type HourlyPoint = {
  validTime: Date;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  cloudCoverPct: number | null;
  weatherCode: number | null;
  uvIndex: number | null;
  source: string;
  fetchedAt: Date;
};

export type DailyPoint = {
  /** Africa/Lagos civil date YYYY-MM-DD */
  date: string;
  tmaxC: number | null;
  tminC: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  windMaxKmh: number | null;
  gustsMaxKmh: number | null;
  uvIndexMax: number | null;
  weatherCode: number | null;
  sunrise: Date | null;
  sunset: Date | null;
  source: string;
  fetchedAt: Date;
};

export type ActiveAlert = {
  id: string;
  lgaId: number;
  lgaName: string;
  lgaSlug: string;
  type: "heavy_rain" | "heat" | "wind" | "dry_spell";
  severity: "moderate" | "high";
  validFrom: Date;
  validTo: Date;
  text: string;
  /** alerts are computed by the daily pipeline from forecasts */
  source: string;
  fetchedAt: Date;
};

export type MapLayer = "rain_today" | "tmax_today" | "rain_7d" | "alerts";
export const MAP_LAYERS: readonly MapLayer[] = ["rain_today", "tmax_today", "rain_7d", "alerts"];

export type LayerAggregates = {
  layer: MapLayer;
  /** lgaId → value (null when no forecast row) */
  values: Record<number, number | null>;
  source: string;
  /** newest fetchedAt among contributing rows (alerts: newest createdAt) */
  fetchedAt: Date | null;
};

export type Mover = {
  lgaId: number;
  lgaSlug: string;
  lgaName: string;
  stateName: string;
  value: number;
  source: string;
  fetchedAt: Date;
};

export type CellInfo = {
  id: number;
  centreLat: number;
  centreLon: number;
  active: boolean;
  origin: string;
};

export type PublicNotice = { id: string; title: string; body: string; scope: string };

// ── Forecast rows ──────────────────────────────────────────────────────

const hourlyCols = {
  validTime: forecastHourly.validTime,
  temperatureC: forecastHourly.temperatureC,
  feelsLikeC: forecastHourly.feelsLikeC,
  humidityPct: forecastHourly.humidityPct,
  rainMm: forecastHourly.rainMm,
  rainProbPct: forecastHourly.rainProbPct,
  windSpeedKmh: forecastHourly.windSpeedKmh,
  windGustsKmh: forecastHourly.windGustsKmh,
  windDirectionDeg: forecastHourly.windDirectionDeg,
  cloudCoverPct: forecastHourly.cloudCoverPct,
  weatherCode: forecastHourly.weatherCode,
  uvIndex: forecastHourly.uvIndex,
  source: forecastHourly.source,
  fetchedAt: forecastHourly.fetchedAt,
};

/** Start of the current hour (UTC instant). */
function hourFloor(d: Date): Date {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}

/** Hourly rows from the current hour forward (default 48 h). */
export async function latestHourly(
  cellId: number,
  hours: number = HOURLY_HOURS,
  now: Date = new Date(),
): Promise<HourlyPoint[]> {
  const from = hourFloor(now);
  const to = new Date(from.getTime() + Math.max(1, hours) * 3600_000);
  return db
    .select(hourlyCols)
    .from(forecastHourly)
    .where(
      and(
        eq(forecastHourly.gridCellId, cellId),
        gte(forecastHourly.validTime, from),
        lte(forecastHourly.validTime, new Date(to.getTime() - 1)),
      ),
    )
    .orderBy(asc(forecastHourly.validTime));
}

/**
 * The hourly row nearest to `now` (current conditions). Falls back to the
 * newest row available when the forecast run has gone stale.
 */
export async function nowRow(cellId: number, now: Date = new Date()): Promise<HourlyPoint | null> {
  const [row] = await db
    .select(hourlyCols)
    .from(forecastHourly)
    .where(eq(forecastHourly.gridCellId, cellId))
    .orderBy(sql`abs(extract(epoch from ${forecastHourly.validTime} - ${now.toISOString()}::timestamptz))`)
    .limit(1);
  return row ?? null;
}

/** Up to 16 daily rows from today (Lagos) forward. */
export async function daily16(cellId: number, today: string = lagosToday()): Promise<DailyPoint[]> {
  return db
    .select({
      date: forecastDaily.date,
      tmaxC: forecastDaily.tmaxC,
      tminC: forecastDaily.tminC,
      rainMm: forecastDaily.rainMm,
      rainProbPct: forecastDaily.rainProbPct,
      windMaxKmh: forecastDaily.windMaxKmh,
      gustsMaxKmh: forecastDaily.gustsMaxKmh,
      uvIndexMax: forecastDaily.uvIndexMax,
      weatherCode: forecastDaily.weatherCode,
      sunrise: forecastDaily.sunrise,
      sunset: forecastDaily.sunset,
      source: forecastDaily.source,
      fetchedAt: forecastDaily.fetchedAt,
    })
    .from(forecastDaily)
    .where(and(eq(forecastDaily.gridCellId, cellId), gte(forecastDaily.date, today)))
    .orderBy(asc(forecastDaily.date))
    .limit(FORECAST_DAYS);
}

/** Newest daily-forecast fetch for a cell — drives the provider-outage banner. */
export async function newestDailyFetch(cellId: number): Promise<{ source: string; fetchedAt: Date } | null> {
  const [row] = await db
    .select({ source: forecastDaily.source, fetchedAt: forecastDaily.fetchedAt })
    .from(forecastDaily)
    .where(eq(forecastDaily.gridCellId, cellId))
    .orderBy(desc(forecastDaily.fetchedAt))
    .limit(1);
  return row ?? null;
}

// ── Grid cells ─────────────────────────────────────────────────────────

/** The grid cell containing a point (no creation — the worker owns that). */
export async function cellAtPoint(lat: number, lon: number): Promise<CellInfo | null> {
  const [row] = await db
    .select({
      id: gridCells.id,
      centreLat: gridCells.centreLat,
      centreLon: gridCells.centreLon,
      active: gridCells.active,
      origin: gridCells.origin,
    })
    .from(gridCells)
    .where(and(eq(gridCells.latIdx, gridIdx(lat)), eq(gridCells.lonIdx, gridIdx(lon))))
    .limit(1);
  return row ?? null;
}

/** Nearest ACTIVE grid cell within `maxDeg` degrees (box + distance order). */
export async function nearestActiveCell(lat: number, lon: number, maxDeg = 0.3): Promise<CellInfo | null> {
  const [row] = await db
    .select({
      id: gridCells.id,
      centreLat: gridCells.centreLat,
      centreLon: gridCells.centreLon,
      active: gridCells.active,
      origin: gridCells.origin,
    })
    .from(gridCells)
    .where(
      and(
        eq(gridCells.active, true),
        gte(gridCells.centreLat, lat - maxDeg),
        lte(gridCells.centreLat, lat + maxDeg),
        gte(gridCells.centreLon, lon - maxDeg),
        lte(gridCells.centreLon, lon + maxDeg),
      ),
    )
    .orderBy(
      sql`(${gridCells.centreLat} - ${lat}::float8)^2 + (${gridCells.centreLon} - ${lon}::float8)^2`,
    )
    .limit(1);
  return row ?? null;
}

// ── Alerts ─────────────────────────────────────────────────────────────

const alertCols = {
  id: alerts.id,
  lgaId: alerts.lgaId,
  lgaName: lgas.name,
  lgaSlug: lgas.slug,
  type: alerts.type,
  severity: alerts.severity,
  validFrom: alerts.validFrom,
  validTo: alerts.validTo,
  text: alerts.text,
  createdAt: alerts.createdAt,
};

type AlertRow = Omit<ActiveAlert, "source" | "fetchedAt"> & { createdAt: Date };

function toActive(rows: AlertRow[]): ActiveAlert[] {
  return rows.map(({ createdAt, ...r }) => ({ ...r, source: "computed", fetchedAt: createdAt }));
}

/** Alerts not yet expired for one LGA, high severity first. */
export async function activeAlertsForLga(lgaId: number, now: Date = new Date()): Promise<ActiveAlert[]> {
  const rows = await db
    .select(alertCols)
    .from(alerts)
    .innerJoin(lgas, eq(lgas.id, alerts.lgaId))
    .where(and(eq(alerts.lgaId, lgaId), gte(alerts.validTo, now)))
    .orderBy(desc(alerts.severity), asc(alerts.validFrom));
  return toActive(rows);
}

/** Alerts not yet expired for any LGA in a state. */
export async function activeAlertsForState(stateId: number, now: Date = new Date()): Promise<ActiveAlert[]> {
  const rows = await db
    .select(alertCols)
    .from(alerts)
    .innerJoin(lgas, eq(lgas.id, alerts.lgaId))
    .where(and(eq(lgas.stateId, stateId), gte(alerts.validTo, now)))
    .orderBy(desc(alerts.severity), asc(lgas.name), asc(alerts.validFrom));
  return toActive(rows);
}

/** National count of alerts not yet expired (home banner). */
export async function activeAlertCount(now: Date = new Date()): Promise<{ alerts: number; lgas: number }> {
  const [row] = await db
    .select({
      alerts: sql<number>`count(*)::int`,
      lgas: sql<number>`count(distinct ${alerts.lgaId})::int`,
    })
    .from(alerts)
    .where(gte(alerts.validTo, now));
  return { alerts: Number(row?.alerts ?? 0), lgas: Number(row?.lgas ?? 0) };
}

// ── Home map layers ────────────────────────────────────────────────────

/** Per-LGA values for one home-map layer, via lgas.grid_cell_id. */
export async function layerAggregates(
  layer: MapLayer,
  now: Date = new Date(),
  today: string = lagosToday(),
): Promise<LayerAggregates> {
  if (layer === "alerts") {
    const rows = await db
      .select({
        lgaId: lgas.id,
        value: sql<number>`count(${alerts.id})::int`,
        newest: sql<Date | null>`max(${alerts.createdAt})`,
      })
      .from(lgas)
      .leftJoin(alerts, and(eq(alerts.lgaId, lgas.id), gte(alerts.validTo, now)))
      .groupBy(lgas.id);
    const values: Record<number, number | null> = {};
    let newest: Date | null = null;
    for (const r of rows) {
      values[r.lgaId] = Number(r.value);
      const d = r.newest ? new Date(r.newest) : null;
      if (d && (!newest || d > newest)) newest = d;
    }
    return { layer, values, source: "computed", fetchedAt: newest };
  }

  const end = layer === "rain_7d" ? addDaysIso(today, 6) : today;
  const valueExpr =
    layer === "rain_today"
      ? sql<number | null>`max(${forecastDaily.rainMm})`
      : layer === "tmax_today"
        ? sql<number | null>`max(${forecastDaily.tmaxC})`
        : sql<number | null>`sum(${forecastDaily.rainMm})`;

  const rows = await db
    .select({
      lgaId: lgas.id,
      value: valueExpr,
      source: sql<string | null>`max(${forecastDaily.source})`,
      fetchedAt: sql<Date | null>`max(${forecastDaily.fetchedAt})`,
    })
    .from(lgas)
    .leftJoin(
      forecastDaily,
      and(
        eq(forecastDaily.gridCellId, lgas.gridCellId),
        gte(forecastDaily.date, today),
        lte(forecastDaily.date, end),
      ),
    )
    .groupBy(lgas.id);

  const values: Record<number, number | null> = {};
  let newest: Date | null = null;
  let source = "unknown";
  for (const r of rows) {
    values[r.lgaId] = r.value === null ? null : Math.round(Number(r.value) * 10) / 10;
    if (r.source) source = r.source;
    const d = r.fetchedAt ? new Date(r.fetchedAt) : null;
    if (d && (!newest || d > newest)) newest = d;
  }
  return { layer, values, source, fetchedAt: newest };
}

/** 3 wettest + 3 hottest LGAs today (Lagos civil date). */
export async function topMovers(
  today: string = lagosToday(),
  n = 3,
): Promise<{ wettest: Mover[]; hottest: Mover[] }> {
  const base = () =>
    db
      .select({
        lgaId: lgas.id,
        lgaSlug: lgas.slug,
        lgaName: lgas.name,
        stateName: states.name,
        rainMm: forecastDaily.rainMm,
        tmaxC: forecastDaily.tmaxC,
        source: forecastDaily.source,
        fetchedAt: forecastDaily.fetchedAt,
      })
      .from(lgas)
      .innerJoin(states, eq(states.id, lgas.stateId))
      .innerJoin(
        forecastDaily,
        and(eq(forecastDaily.gridCellId, lgas.gridCellId), eq(forecastDaily.date, today)),
      );

  const [wet, hot] = await Promise.all([
    base()
      .where(sql`${forecastDaily.rainMm} is not null`)
      .orderBy(desc(forecastDaily.rainMm), asc(lgas.name))
      .limit(n),
    base()
      .where(sql`${forecastDaily.tmaxC} is not null`)
      .orderBy(desc(forecastDaily.tmaxC), asc(lgas.name))
      .limit(n),
  ]);
  const map = (rows: typeof wet, pick: "rainMm" | "tmaxC"): Mover[] =>
    rows.map((r) => ({
      lgaId: r.lgaId,
      lgaSlug: r.lgaSlug,
      lgaName: r.lgaName,
      stateName: r.stateName,
      value: Number(r[pick]),
      source: r.source,
      fetchedAt: r.fetchedAt,
    }));
  return { wettest: map(wet, "rainMm"), hottest: map(hot, "tmaxC") };
}

// ── Notices ────────────────────────────────────────────────────────────

/**
 * Active, unexpired editor notices for the given scopes
 * ('global' | 'home' | 'place:<kind>:<id>' …), newest first.
 */
export async function activeNotices(scopes: string[], now: Date = new Date()): Promise<PublicNotice[]> {
  if (scopes.length === 0) return [];
  return db
    .select({ id: notices.id, title: notices.title, body: notices.body, scope: notices.scope })
    .from(notices)
    .where(
      and(
        eq(notices.active, true),
        inArray(notices.scope, scopes),
        or(isNull(notices.expiresAt), gte(notices.expiresAt, now)),
      ),
    )
    .orderBy(desc(notices.createdAt))
    .limit(5);
}
