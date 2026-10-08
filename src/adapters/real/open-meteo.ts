/**
 * Open-Meteo forecast driver (real).
 *
 * Docs (verified 2026-10-08): https://open-meteo.com/en/docs
 * Pricing / weighted calls:   https://open-meteo.com/en/pricing
 * Commercial use:             https://open-meteo.com/en/terms
 *   → customer-api.open-meteo.com with &apikey= when OPEN_METEO_API_KEY is set
 *     (the free api.open-meteo.com host is non-commercial only).
 *
 * One HTTP request per chunk of ≤ maxPointsPerCall coordinates
 * (comma-separated latitude/longitude). Mapping lives in ./mappers/open-meteo.
 */

import { env } from "@/lib/env";
import { lagosToday } from "@/lib/time";
import type { ForecastAdapter, ForecastResult, LatLon, ObservedDay } from "../types";
import { fetchJson, tracked } from "./http";
import {
  DAILY_VARS,
  HOURLY_VARS,
  OPEN_METEO_FORECAST_DAYS,
  OPEN_METEO_MAX_POINTS,
  RECENT_DAILY_VARS,
  buildForecastUrl,
  buildRecentUrl,
  locationsOf,
  mapDaily,
  mapHourly,
  mapRecentDaily,
  openMeteoCallWeight,
  redactUrl,
  type OpenMeteoBody,
} from "./mappers/open-meteo";

const SOURCE = "open-meteo";
const apiKey = () => (env.OPEN_METEO_API_KEY ? env.OPEN_METEO_API_KEY : undefined);

function assertChunk(points: readonly LatLon[]) {
  if (points.length > OPEN_METEO_MAX_POINTS) {
    throw new Error(`open-meteo: ${points.length} points exceeds maxPointsPerCall ${OPEN_METEO_MAX_POINTS}`);
  }
}

export const openMeteoAdapter: ForecastAdapter = {
  name: SOURCE,
  maxPointsPerCall: OPEN_METEO_MAX_POINTS,

  async fetchForecast(points: LatLon[]): Promise<ForecastResult[]> {
    if (points.length === 0) return [];
    assertChunk(points);
    const url = buildForecastUrl(points, apiKey());
    const weight = openMeteoCallWeight(points.length, HOURLY_VARS.length + DAILY_VARS.length, OPEN_METEO_FORECAST_DAYS);
    const body = await tracked(
      SOURCE,
      () => fetchJson<OpenMeteoBody>(SOURCE, url, { label: redactUrl(url).slice(0, 120) }),
      weight,
    );
    const fetchedAt = new Date();
    return locationsOf(body, points.length).map((loc, i) => ({
      point: points[i],
      hourly: mapHourly(loc),
      daily: mapDaily(loc),
      source: SOURCE,
      fetchedAt,
    }));
  },

  async fetchRecentDaily(points: LatLon[], days: number) {
    if (points.length === 0) return [];
    assertChunk(points);
    const url = buildRecentUrl(points, days, apiKey());
    const weight = openMeteoCallWeight(points.length, RECENT_DAILY_VARS.length, days + 1);
    const body = await tracked(
      SOURCE,
      () => fetchJson<OpenMeteoBody>(SOURCE, url, { label: "past_days" }),
      weight,
    );
    const fetchedAt = new Date();
    const today = lagosToday();
    return locationsOf(body, points.length).map((loc, i) => ({
      point: points[i],
      days: mapRecentDaily(loc, today) as ObservedDay[],
      source: SOURCE,
      fetchedAt,
    }));
  },
};
