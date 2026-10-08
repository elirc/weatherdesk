import { describe, expect, it } from "vitest";
import { buildNasaUrl, mapNasaPower, type NasaPowerBody } from "@/adapters/real/mappers/nasa-power";

/**
 * Verbatim (trimmed) live response from the POWER daily point API, AG
 * community (https://power.larc.nasa.gov/docs/services/api/temporal/daily/):
 * the latest day is all fill values (-999.0), solar lags further.
 */
const FIXTURE: NasaPowerBody = {
  properties: {
    parameter: {
      PRECTOTCORR: { "20261004": 5.93, "20261005": 9.49, "20261006": -999.0 },
      T2M_MAX: { "20261004": 28.28, "20261005": 27.4, "20261006": -999.0 },
      T2M_MIN: { "20261004": 24.79, "20261005": 24.54, "20261006": -999.0 },
      RH2M: { "20261004": 86.86, "20261005": 89.86, "20261006": -999.0 },
      WS2M: { "20261004": 1.98, "20261005": 2.12, "20261006": -999.0 },
      ALLSKY_SFC_SW_DWN: { "20261004": -999.0, "20261005": -999.0, "20261006": -999.0 },
    },
  },
  header: { fill_value: -999.0 },
  parameters: {
    PRECTOTCORR: { units: "mm/day" },
    WS2M: { units: "m/s" },
    ALLSKY_SFC_SW_DWN: { units: "MJ/m^2/day" },
  },
  messages: [],
};

describe("nasa-power request", () => {
  it("builds the daily point URL with AG community and compact dates", () => {
    const url = new URL(buildNasaUrl({ lat: 6.45, lon: 3.39 }, "2026-10-04", "2026-10-06"));
    expect(url.origin + url.pathname).toBe("https://power.larc.nasa.gov/api/temporal/daily/point");
    expect(url.searchParams.get("community")).toBe("AG");
    expect(url.searchParams.get("parameters")).toBe("PRECTOTCORR,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN");
    expect(url.searchParams.get("start")).toBe("20261004");
    expect(url.searchParams.get("end")).toBe("20261006");
    expect(url.searchParams.get("format")).toBe("JSON");
    expect(url.searchParams.get("latitude")).toBe("6.4500");
    expect(url.searchParams.get("longitude")).toBe("3.3900");
  });
});

describe("nasa-power mapping", () => {
  const days = mapNasaPower(FIXTURE);

  it("returns one ISO-dated day per key, sorted", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
  });

  it("maps values and converts WS2M m/s → km/h", () => {
    expect(days[0]).toEqual({
      date: "2026-10-04",
      rainMm: 5.93,
      tmaxC: 28.28,
      tminC: 24.79,
      humidityPct: 86.86,
      windKmh: 7.13, // 1.98 × 3.6
      solarMjM2: null, // -999 fill
    });
  });

  it("maps -999 fill values to null", () => {
    expect(days[2]).toEqual({
      date: "2026-10-06",
      rainMm: null,
      tmaxC: null,
      tminC: null,
      humidityPct: null,
      windKmh: null,
      solarMjM2: null,
    });
  });

  it("keeps MJ/m² solar unconverted (AG community unit)", () => {
    const d = mapNasaPower({
      ...FIXTURE,
      properties: { parameter: { ...FIXTURE.properties!.parameter, ALLSKY_SFC_SW_DWN: { "20261004": 17.5 } } },
    });
    expect(d[0].solarMjM2).toBe(17.5);
  });

  it("throws on an error body without data", () => {
    expect(() => mapNasaPower({ messages: ["bad request"] })).toThrow(/bad request/);
  });
});
