import { describe, expect, it } from "vitest";
import { mapGoogleDay, mapGoogleHour } from "@/adapters/real/mappers/google-weather";

// Shapes from https://developers.google.com/maps/documentation/weather/daily-forecast and /hourly-forecast
describe("google weather mapping", () => {
  it("sums day + night qpf and takes max probability / gust", () => {
    const d = mapGoogleDay({
      displayDate: { year: 2026, month: 10, day: 9 },
      maxTemperature: { degrees: 31.2 },
      minTemperature: { degrees: 23.4 },
      sunEvents: { sunriseTime: "2026-10-09T05:33:10Z", sunsetTime: "2026-10-09T17:33:00Z" },
      daytimeForecast: {
        precipitation: { probability: { percent: 60 }, qpf: { quantity: 12.25 } },
        wind: { speed: { value: 14 }, gust: { value: 40 } },
        uvIndex: 8,
      },
      nighttimeForecast: {
        precipitation: { probability: { percent: 75 }, qpf: { quantity: 3.1 } },
        wind: { speed: { value: 10 }, gust: { value: 62 } },
      },
    });
    expect(d).toMatchObject({
      date: "2026-10-09",
      tmaxC: 31.2,
      tminC: 23.4,
      rainMm: 15.4,
      rainProbPct: 75,
      windMaxKmh: 14,
      gustsMaxKmh: 62,
      uvIndexMax: 8,
      weatherCode: null,
    });
    expect(d?.sunrise?.toISOString()).toBe("2026-10-09T05:33:10.000Z");
  });

  it("maps an hourly item", () => {
    expect(
      mapGoogleHour({
        interval: { startTime: "2026-10-09T12:00:00Z" },
        temperature: { degrees: 30 },
        feelsLikeTemperature: { degrees: 34 },
        relativeHumidity: 70,
        uvIndex: 9,
        precipitation: { probability: { percent: 20 }, qpf: { quantity: 0 } },
        wind: { direction: { degrees: 210 }, speed: { value: 11 }, gust: { value: 25 } },
        cloudCover: 40,
      }),
    ).toMatchObject({ temperatureC: 30, feelsLikeC: 34, rainProbPct: 20, windGustsKmh: 25, windDirectionDeg: 210, cloudCoverPct: 40 });
  });

  it("drops items without dates", () => {
    expect(mapGoogleDay({})).toBeNull();
    expect(mapGoogleHour({})).toBeNull();
  });
});
