/**
 * Google Maps Platform Weather API mapping (pure). Minimal, optional driver.
 *
 * Docs (verified 2026-10-08):
 *   https://developers.google.com/maps/documentation/weather/daily-forecast
 *   https://developers.google.com/maps/documentation/weather/hourly-forecast
 *
 * - days:lookup — max 10 days; hours:lookup — max 240 hours; paginated via nextPageToken.
 * - Precipitation, wind and UV live under daytimeForecast / nighttimeForecast
 *   for daily items, so the daily rain total = day qpf + night qpf.
 * - Google uses condition type strings, not WMO codes → weatherCode is null.
 */

import type { DailyPoint, HourlyPoint } from "../../types";

type Val = { degrees?: number } | undefined;
type Precip = { probability?: { percent?: number }; qpf?: { quantity?: number } } | undefined;
type Wind = { direction?: { degrees?: number }; speed?: { value?: number }; gust?: { value?: number } } | undefined;

export type GoogleHalfDay = { precipitation?: Precip; wind?: Wind; uvIndex?: number; relativeHumidity?: number };

export type GoogleDay = {
  displayDate?: { year: number; month: number; day: number };
  maxTemperature?: Val;
  minTemperature?: Val;
  sunEvents?: { sunriseTime?: string; sunsetTime?: string };
  daytimeForecast?: GoogleHalfDay;
  nighttimeForecast?: GoogleHalfDay;
};

export type GoogleHour = {
  interval?: { startTime?: string };
  temperature?: Val;
  feelsLikeTemperature?: Val;
  relativeHumidity?: number;
  uvIndex?: number;
  precipitation?: Precip;
  wind?: Wind;
  cloudCover?: number;
};

const n = (v: number | undefined | null): number | null => (v == null || Number.isNaN(v) ? null : v);
const maxOf = (...xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};

export function mapGoogleDay(d: GoogleDay): DailyPoint | null {
  if (!d.displayDate) return null;
  const { year, month, day } = d.displayDate;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dq = n(d.daytimeForecast?.precipitation?.qpf?.quantity);
  const nq = n(d.nighttimeForecast?.precipitation?.qpf?.quantity);
  return {
    date,
    tmaxC: n(d.maxTemperature?.degrees),
    tminC: n(d.minTemperature?.degrees),
    rainMm: dq == null && nq == null ? null : Math.round(((dq ?? 0) + (nq ?? 0)) * 10) / 10,
    rainProbPct: maxOf(
      n(d.daytimeForecast?.precipitation?.probability?.percent),
      n(d.nighttimeForecast?.precipitation?.probability?.percent),
    ),
    windMaxKmh: maxOf(n(d.daytimeForecast?.wind?.speed?.value), n(d.nighttimeForecast?.wind?.speed?.value)),
    gustsMaxKmh: maxOf(n(d.daytimeForecast?.wind?.gust?.value), n(d.nighttimeForecast?.wind?.gust?.value)),
    uvIndexMax: n(d.daytimeForecast?.uvIndex),
    weatherCode: null,
    sunrise: d.sunEvents?.sunriseTime ? new Date(d.sunEvents.sunriseTime) : null,
    sunset: d.sunEvents?.sunsetTime ? new Date(d.sunEvents.sunsetTime) : null,
  };
}

export function mapGoogleHour(h: GoogleHour): HourlyPoint | null {
  if (!h.interval?.startTime) return null;
  return {
    validTime: new Date(h.interval.startTime),
    temperatureC: n(h.temperature?.degrees),
    feelsLikeC: n(h.feelsLikeTemperature?.degrees),
    humidityPct: n(h.relativeHumidity),
    rainMm: n(h.precipitation?.qpf?.quantity),
    rainProbPct: n(h.precipitation?.probability?.percent),
    windSpeedKmh: n(h.wind?.speed?.value),
    windGustsKmh: n(h.wind?.gust?.value),
    windDirectionDeg: n(h.wind?.direction?.degrees),
    cloudCoverPct: n(h.cloudCover),
    weatherCode: null,
    uvIndex: n(h.uvIndex),
  };
}
