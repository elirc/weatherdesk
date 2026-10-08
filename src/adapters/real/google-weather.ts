/**
 * Google Maps Platform Weather API forecast driver (real) — OPTIONAL,
 * deliberately minimal. Open-Meteo is the primary provider.
 *
 * Docs (verified 2026-10-08):
 *   https://developers.google.com/maps/documentation/weather/daily-forecast
 *   https://developers.google.com/maps/documentation/weather/hourly-forecast
 *   GET https://weather.googleapis.com/v1/forecast/days:lookup?key&location.latitude&location.longitude&days&pageSize&pageToken
 *   GET https://weather.googleapis.com/v1/forecast/hours:lookup?...&hours&pageSize&pageToken
 *
 * Limitations (documented, accepted):
 * - one point per request (maxPointsPerCall = 1); daily horizon is 10 days, not 16;
 * - no WMO weather codes (null);
 * - fetchRecentDaily is not supported (Google history covers only 24 h) —
 *   keep ADAPTER/FORECAST_PROVIDER on open-meteo for the daily pipeline.
 */

import { env } from "@/lib/env";
import type { DailyPoint, ForecastAdapter, ForecastResult, HourlyPoint, LatLon } from "../types";
import { fetchJson, tracked } from "./http";
import { mapGoogleDay, mapGoogleHour, type GoogleDay, type GoogleHour } from "./mappers/google-weather";

const SOURCE = "google-weather";
const BASE = "https://weather.googleapis.com/v1/forecast";
const MAX_DAYS = 10;
const HOURS = 72;

async function paged<T>(path: string, point: LatLon, extra: Record<string, string>, itemsKey: string): Promise<T[]> {
  const key = env.GOOGLE_WEATHER_API_KEY;
  if (!key) throw new Error("google-weather: GOOGLE_WEATHER_API_KEY is not set");
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const p = new URLSearchParams({
      key,
      "location.latitude": String(point.lat),
      "location.longitude": String(point.lon),
      ...extra,
      ...(pageToken ? { pageToken } : {}),
    });
    const body = await fetchJson<Record<string, unknown> & { nextPageToken?: string }>(SOURCE, `${BASE}/${path}?${p}`, {
      label: path,
    });
    out.push(...((body[itemsKey] as T[] | undefined) ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export const googleWeatherAdapter: ForecastAdapter = {
  name: SOURCE,
  maxPointsPerCall: 1,

  async fetchForecast(points: LatLon[]): Promise<ForecastResult[]> {
    const results: ForecastResult[] = [];
    for (const point of points) {
      const [days, hours] = await tracked(
        SOURCE,
        () =>
          Promise.all([
            paged<GoogleDay>("days:lookup", point, { days: String(MAX_DAYS), pageSize: String(MAX_DAYS) }, "forecastDays"),
            paged<GoogleHour>("hours:lookup", point, { hours: String(HOURS), pageSize: "24" }, "forecastHours"),
          ]),
        2,
      );
      results.push({
        point,
        daily: days.map(mapGoogleDay).filter((d): d is DailyPoint => d != null),
        hourly: hours.map(mapGoogleHour).filter((h): h is HourlyPoint => h != null),
        source: SOURCE,
        fetchedAt: new Date(),
      });
    }
    return results;
  },

  async fetchRecentDaily() {
    throw new Error("google-weather: fetchRecentDaily is not supported — use open-meteo for preliminary observations");
  },
};
