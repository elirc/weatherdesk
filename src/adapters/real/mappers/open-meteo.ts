/**
 * Open-Meteo response mapping (pure; no env/db imports so unit tests can use
 * inline doc fixtures).
 *
 * Docs (verified 2026-10-08):
 *   https://open-meteo.com/en/docs          (variables, multi-location, past_days, timeformat)
 *   https://open-meteo.com/en/pricing        (weighted API calls)
 *   https://open-meteo.com/en/terms          (commercial use → customer-api host + apikey)
 *
 * Facts relied on:
 * - Comma-separated latitude/longitude → the JSON body is a top-level ARRAY,
 *   one object per location in request order (only later entries carry
 *   `location_id`), so results are matched by array position.
 * - timeformat=unixtime → all times are GMT+0 unix seconds; daily `time` is
 *   local midnight for the requested timezone (Africa/Lagos).
 * - Default units: °C, mm, km/h (wind_speed_unit=kmh).
 * - Weighted calls: > 10 variables or > 2 weeks of data per location count as
 *   fractional extra calls ("2 weeks with 15 variables = 1.5 calls").
 */

import type { DailyPoint, HourlyPoint, LatLon, ObservedDay } from "../../types";
import { lagosDateOf } from "@/lib/time";

export const OPEN_METEO_FREE_BASE = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_CUSTOMER_BASE = "https://customer-api.open-meteo.com/v1/forecast";

export const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "cloud_cover",
  "weather_code",
  "uv_index",
] as const;

export const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "uv_index_max",
  "weather_code",
  "sunrise",
  "sunset",
] as const;

export const RECENT_DAILY_VARS = [
  "precipitation_sum",
  "temperature_2m_max",
  "temperature_2m_min",
  "relative_humidity_2m_mean",
  "wind_speed_10m_mean",
  "shortwave_radiation_sum",
] as const;

/** Hourly steps requested (from the current hour). */
export const OPEN_METEO_FORECAST_HOURS = 72;
export const OPEN_METEO_FORECAST_DAYS = 16;
/**
 * Locations per request. The docs do not state a maximum; 50 keeps the URL
 * short (~1.5 KB) and each response well under a few MB.
 */
export const OPEN_METEO_MAX_POINTS = 50;

type Series = Record<string, (number | null)[] | undefined>;

export type OpenMeteoLocation = {
  latitude: number;
  longitude: number;
  utc_offset_seconds?: number;
  location_id?: number;
  hourly?: Series & { time?: number[] };
  daily?: Series & { time?: number[] };
};

export type OpenMeteoBody = OpenMeteoLocation | OpenMeteoLocation[];

export function buildForecastUrl(points: readonly LatLon[], apiKey?: string): string {
  const base = apiKey ? OPEN_METEO_CUSTOMER_BASE : OPEN_METEO_FREE_BASE;
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat.toFixed(4)).join(","),
    longitude: points.map((x) => x.lon.toFixed(4)).join(","),
    hourly: HOURLY_VARS.join(","),
    daily: DAILY_VARS.join(","),
    forecast_days: String(OPEN_METEO_FORECAST_DAYS),
    forecast_hours: String(OPEN_METEO_FORECAST_HOURS),
    timezone: "Africa/Lagos",
    timeformat: "unixtime",
  });
  if (apiKey) p.set("apikey", apiKey);
  return `${base}?${p.toString()}`;
}

export function buildRecentUrl(points: readonly LatLon[], days: number, apiKey?: string): string {
  const base = apiKey ? OPEN_METEO_CUSTOMER_BASE : OPEN_METEO_FREE_BASE;
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat.toFixed(4)).join(","),
    longitude: points.map((x) => x.lon.toFixed(4)).join(","),
    daily: RECENT_DAILY_VARS.join(","),
    past_days: String(Math.min(92, Math.max(1, days))),
    forecast_days: "1",
    timezone: "Africa/Lagos",
    timeformat: "unixtime",
  });
  if (apiKey) p.set("apikey", apiKey);
  return `${base}?${p.toString()}`;
}

/**
 * Weighted call count per the pricing page: per location,
 * max(1, nVars/10) × max(1, days/14). Rounded up for the integer budget counter.
 */
export function openMeteoCallWeight(nLocations: number, nVariables: number, nDays: number): number {
  const perLoc = Math.max(1, nVariables / 10) * Math.max(1, nDays / 14);
  // round to 6 dp first so float noise (24.000000000000004) does not ceil up
  return Math.ceil(Math.round(nLocations * perLoc * 1e6) / 1e6);
}

/** Normalise a single-object or array body into one entry per requested point. */
export function locationsOf(body: OpenMeteoBody, expected: number): OpenMeteoLocation[] {
  const arr = Array.isArray(body) ? body : [body];
  if (arr.length !== expected) {
    throw new Error(`open-meteo returned ${arr.length} locations, expected ${expected}`);
  }
  return arr;
}

const num = (s: Series | undefined, key: string, i: number): number | null => {
  const v = s?.[key]?.[i];
  return v == null || Number.isNaN(v) ? null : v;
};

const unixDate = (sec: number | null): Date | null => (sec == null ? null : new Date(sec * 1000));

export function mapHourly(loc: OpenMeteoLocation): HourlyPoint[] {
  const h = loc.hourly;
  const times = h?.time ?? [];
  return times.map((t, i) => ({
    validTime: new Date(t * 1000),
    temperatureC: num(h, "temperature_2m", i),
    feelsLikeC: num(h, "apparent_temperature", i),
    humidityPct: num(h, "relative_humidity_2m", i),
    rainMm: num(h, "precipitation", i),
    rainProbPct: num(h, "precipitation_probability", i),
    windSpeedKmh: num(h, "wind_speed_10m", i),
    windGustsKmh: num(h, "wind_gusts_10m", i),
    windDirectionDeg: num(h, "wind_direction_10m", i),
    cloudCoverPct: num(h, "cloud_cover", i),
    weatherCode: num(h, "weather_code", i),
    uvIndex: num(h, "uv_index", i),
  }));
}

export function mapDaily(loc: OpenMeteoLocation): DailyPoint[] {
  const d = loc.daily;
  const times = d?.time ?? [];
  return times.map((t, i) => ({
    // daily time = local (Lagos) midnight as a unix instant → Lagos civil date
    date: lagosDateOf(new Date(t * 1000)),
    tmaxC: num(d, "temperature_2m_max", i),
    tminC: num(d, "temperature_2m_min", i),
    rainMm: num(d, "precipitation_sum", i),
    rainProbPct: num(d, "precipitation_probability_max", i),
    windMaxKmh: num(d, "wind_speed_10m_max", i),
    gustsMaxKmh: num(d, "wind_gusts_10m_max", i),
    uvIndexMax: num(d, "uv_index_max", i),
    weatherCode: num(d, "weather_code", i),
    sunrise: unixDate(num(d, "sunrise", i)),
    sunset: unixDate(num(d, "sunset", i)),
  }));
}

/** past_days daily → ObservedDay, keeping only dates strictly before `lagosToday`. */
export function mapRecentDaily(loc: OpenMeteoLocation, lagosToday: string): ObservedDay[] {
  const d = loc.daily;
  const times = d?.time ?? [];
  const out: ObservedDay[] = [];
  times.forEach((t, i) => {
    const date = lagosDateOf(new Date(t * 1000));
    if (date >= lagosToday) return;
    out.push({
      date,
      rainMm: num(d, "precipitation_sum", i),
      tmaxC: num(d, "temperature_2m_max", i),
      tminC: num(d, "temperature_2m_min", i),
      humidityPct: num(d, "relative_humidity_2m_mean", i),
      windKmh: num(d, "wind_speed_10m_mean", i),
      solarMjM2: num(d, "shortwave_radiation_sum", i), // MJ/m² per docs
    });
  });
  return out;
}

/** Redact the API key from a URL before it reaches logs / source_health. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]apikey=)[^&]+/i, "$1***");
}
