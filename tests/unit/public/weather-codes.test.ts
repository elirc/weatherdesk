import { describe, expect, it } from "vitest";
import {
  UNKNOWN_WEATHER,
  WEATHER_CODES,
  WMO_CODES,
  weatherCodeInfo,
} from "@/components/forecast/weather-codes";

/** Every WMO 4677 code Open-Meteo documents for `weather_code`. */
const OPEN_METEO_WMO = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
];

describe("weather code mapping", () => {
  it("covers every documented WMO code exactly once", () => {
    expect([...WMO_CODES].sort((a, b) => a - b)).toEqual(OPEN_METEO_WMO);
    expect(new Set(WMO_CODES).size).toBe(WMO_CODES.length);
  });

  it("gives each code a non-empty label and an icon component", () => {
    for (const code of OPEN_METEO_WMO) {
      const info = WEATHER_CODES.get(code);
      expect(info, `code ${code}`).toBeDefined();
      expect(info!.label.length).toBeGreaterThan(2);
      expect(info!.icon).toBeTruthy();
      expect(info!.code).toBe(code);
    }
  });

  it("covers the codes the mock adapter emits", () => {
    for (const code of [1, 3, 61]) expect(WEATHER_CODES.has(code)).toBe(true);
  });

  it("groups rain, storms and clear sky sensibly", () => {
    expect(weatherCodeInfo(0).group).toBe("clear");
    expect(weatherCodeInfo(63).group).toBe("rain");
    expect(weatherCodeInfo(95).group).toBe("storm");
    expect(weatherCodeInfo(45).group).toBe("fog");
  });

  it("falls back for unknown / missing codes", () => {
    expect(weatherCodeInfo(null).label).toBe(UNKNOWN_WEATHER.label);
    expect(weatherCodeInfo(undefined).label).toBe(UNKNOWN_WEATHER.label);
    expect(weatherCodeInfo(42).label).toBe(UNKNOWN_WEATHER.label);
    expect(weatherCodeInfo(42).code).toBe(42);
  });
});
