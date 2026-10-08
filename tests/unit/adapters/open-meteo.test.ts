import { describe, expect, it } from "vitest";
import {
  DAILY_VARS,
  HOURLY_VARS,
  buildForecastUrl,
  buildRecentUrl,
  locationsOf,
  mapDaily,
  mapHourly,
  mapRecentDaily,
  openMeteoCallWeight,
  redactUrl,
  type OpenMeteoBody,
} from "@/adapters/real/mappers/open-meteo";

/**
 * Fixture shape copied from a live multi-location Open-Meteo response
 * (https://open-meteo.com/en/docs): a top-level ARRAY, the second entry with
 * location_id 1, timezone=Africa/Lagos (utc_offset_seconds 3600),
 * timeformat=unixtime. Daily time 1791414000 = 2026-10-07T23:00Z = Lagos
 * midnight 2026-10-08. Trimmed to 2 hours / 1–2 days.
 */
const MULTI: OpenMeteoBody = [
  {
    latitude: 6.4323373,
    longitude: 3.3948028,
    utc_offset_seconds: 3600,
    hourly: {
      time: [1791478800, 1791482400], // 2026-10-08T17:00Z, 18:00Z
      temperature_2m: [26.7, 26.1],
      apparent_temperature: [30.2, 29.5],
      relative_humidity_2m: [84, 86],
      precipitation: [0.4, 0],
      precipitation_probability: [55, 20],
      wind_speed_10m: [9.4, 8.1],
      wind_gusts_10m: [22.3, 18],
      wind_direction_10m: [225, 230],
      cloud_cover: [88, 60],
      weather_code: [61, 3],
      uv_index: [0.9, 0.1],
    },
    daily: {
      time: [1791414000, 1791500400],
      temperature_2m_max: [27.9, 29.1],
      temperature_2m_min: [23.8, 24],
      precipitation_sum: [12.3, null],
      precipitation_probability_max: [80, 35],
      wind_speed_10m_max: [14.2, 12],
      wind_gusts_10m_max: [61.2, 30],
      uv_index_max: [6.5, 7.1],
      weather_code: [95, 3],
      sunrise: [1791437598, 1791523990],
      sunset: [1791480780, 1791567150],
    },
  },
  {
    latitude: 9.103691,
    longitude: 7.4025974,
    utc_offset_seconds: 3600,
    location_id: 1,
    hourly: { time: [1791478800], temperature_2m: [26.5] },
    daily: { time: [1791414000], temperature_2m_max: [28.0] },
  },
];

describe("open-meteo request building", () => {
  it("uses comma-separated coordinates in one request on the free host without a key", () => {
    const url = new URL(buildForecastUrl([{ lat: 6.5, lon: 3.4 }, { lat: 7.1, lon: 5.0 }]));
    expect(url.host).toBe("api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("6.5000,7.1000");
    expect(url.searchParams.get("longitude")).toBe("3.4000,5.0000");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("Africa/Lagos");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("hourly")?.split(",")).toEqual([...HOURLY_VARS]);
    expect(url.searchParams.get("daily")?.split(",")).toEqual([...DAILY_VARS]);
    expect(url.searchParams.has("apikey")).toBe(false);
  });

  it("switches to the customer host and attaches apikey when a key is set", () => {
    const url = new URL(buildForecastUrl([{ lat: 6.5, lon: 3.4 }], "secret123"));
    expect(url.host).toBe("customer-api.open-meteo.com");
    expect(url.searchParams.get("apikey")).toBe("secret123");
    expect(redactUrl(url.toString())).not.toContain("secret123");
  });

  it("requests past_days for recent daily", () => {
    const url = new URL(buildRecentUrl([{ lat: 6.5, lon: 3.4 }], 7));
    expect(url.searchParams.get("past_days")).toBe("7");
    expect(url.searchParams.get("daily")).toContain("shortwave_radiation_sum");
  });

  it("weights calls per the pricing page (>10 vars, >2 weeks)", () => {
    expect(openMeteoCallWeight(1, 10, 14)).toBe(1);
    expect(openMeteoCallWeight(1, 15, 14)).toBe(2); // 1.5 → ceil
    expect(openMeteoCallWeight(2, 15, 14)).toBe(3);
    expect(openMeteoCallWeight(10, 21, 16)).toBe(24); // 2.1 × 16/14 × 10 = 24
  });
});

describe("open-meteo response mapping", () => {
  it("matches multi-location results by array position", () => {
    const locs = locationsOf(MULTI, 2);
    expect(locs[1].location_id).toBe(1);
    expect(mapDaily(locs[1])[0]).toMatchObject({ date: "2026-10-08", tmaxC: 28, rainMm: null });
  });

  it("accepts a single-object body for one location and rejects count mismatches", () => {
    expect(locationsOf((MULTI as unknown[])[0] as OpenMeteoBody, 1)).toHaveLength(1);
    expect(() => locationsOf(MULTI, 3)).toThrow(/expected 3/);
  });

  it("maps daily fields, Lagos civil dates and sun times", () => {
    const d = mapDaily(locationsOf(MULTI, 2)[0]);
    expect(d.map((x) => x.date)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(d[0]).toMatchObject({
      tmaxC: 27.9,
      tminC: 23.8,
      rainMm: 12.3,
      rainProbPct: 80,
      windMaxKmh: 14.2,
      gustsMaxKmh: 61.2,
      uvIndexMax: 6.5,
      weatherCode: 95,
    });
    expect(d[0].sunrise?.toISOString()).toBe(new Date(1791437598 * 1000).toISOString());
    expect(d[1].rainMm).toBeNull();
  });

  it("maps hourly fields with UTC valid times", () => {
    const h = mapHourly(locationsOf(MULTI, 2)[0]);
    expect(h).toHaveLength(2);
    expect(h[0].validTime.toISOString()).toBe("2026-10-08T17:00:00.000Z");
    expect(h[0]).toMatchObject({
      temperatureC: 26.7,
      feelsLikeC: 30.2,
      humidityPct: 84,
      rainMm: 0.4,
      rainProbPct: 55,
      windSpeedKmh: 9.4,
      windGustsKmh: 22.3,
      windDirectionDeg: 225,
      cloudCoverPct: 88,
      weatherCode: 61,
      uvIndex: 0.9,
    });
    // missing variables map to null, not undefined
    expect(mapHourly(locationsOf(MULTI, 2)[1])[0].uvIndex).toBeNull();
  });

  it("maps past_days to ObservedDay and drops today", () => {
    const loc = {
      latitude: 6.43,
      longitude: 3.39,
      daily: {
        time: [1791241200, 1791327600, 1791414000], // Lagos 2026-10-06, -07, -08
        precipitation_sum: [5.9, 0, 1.2],
        temperature_2m_max: [28.3, 27.4, 27.9],
        temperature_2m_min: [24.8, 24.5, 23.8],
        relative_humidity_2m_mean: [84, 86, 80],
        wind_speed_10m_mean: [7.1, 6.2, 7.2],
        shortwave_radiation_sum: [17.22, 16.75, 15],
      },
    };
    const days = mapRecentDaily(loc, "2026-10-08");
    expect(days.map((d) => d.date)).toEqual(["2026-10-06", "2026-10-07"]);
    expect(days[0]).toEqual({
      date: "2026-10-06",
      rainMm: 5.9,
      tmaxC: 28.3,
      tminC: 24.8,
      humidityPct: 84,
      windKmh: 7.1,
      solarMjM2: 17.22,
    });
  });
});
