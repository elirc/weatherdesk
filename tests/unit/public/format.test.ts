import { describe, expect, it } from "vitest";
import {
  daysBetween,
  degToCompass,
  fmt,
  formatDayLabel,
  isStale,
  relativeDayLabel,
  uvBand,
} from "@/components/forecast/format";
import { confidenceLabel } from "@/lib/weather/constants";

describe("forecast format helpers", () => {
  it("formats a civil date as weekday + day + month (no time)", () => {
    // ICU builds differ on the comma after the weekday
    expect(formatDayLabel("2026-10-08")).toMatch(/^Thu,? 8 Oct$/);
    expect(formatDayLabel("2026-01-01")).toMatch(/^Thu,? 1 Jan$/);
  });

  it("labels today / tomorrow relative to Lagos today", () => {
    expect(relativeDayLabel("2026-10-08", "2026-10-08")).toBe("Today");
    expect(relativeDayLabel("2026-10-09", "2026-10-08")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-10-10", "2026-10-08")).toMatch(/^Sat,? 10 Oct$/);
  });

  it("computes lead days across month ends and feeds confidence", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(confidenceLabel(daysBetween("2026-10-08", "2026-10-10"))).toBe("high");
    expect(confidenceLabel(daysBetween("2026-10-08", "2026-10-13"))).toBe("medium");
    expect(confidenceLabel(daysBetween("2026-10-08", "2026-10-23"))).toBe("low");
  });

  it("maps wind direction to an 8-point compass", () => {
    expect(degToCompass(0)).toBe("N");
    expect(degToCompass(359)).toBe("N");
    expect(degToCompass(44)).toBe("NE");
    expect(degToCompass(180)).toBe("S");
    expect(degToCompass(225)).toBe("SW");
    expect(degToCompass(-90)).toBe("W");
    expect(degToCompass(null)).toBe("–");
  });

  it("formats values with explicit units", () => {
    expect(fmt(31.26, "°C")).toBe("31°C");
    expect(fmt(4.25, "mm", 1)).toBe("4.3 mm");
    expect(fmt(12, "km/h")).toBe("12 km/h");
    expect(fmt(55, "%")).toBe("55%");
    expect(fmt(null, "mm")).toBe("–");
    expect(fmt(Number.NaN, "mm")).toBe("–");
  });

  it("flags forecasts older than 12 h as stale (provider-outage rule)", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(isStale(new Date("2026-10-08T01:00:00Z"), now)).toBe(false);
    expect(isStale(new Date("2026-10-07T23:59:00Z"), now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });

  it("bands UV index", () => {
    expect(uvBand(1)).toBe("low");
    expect(uvBand(5)).toBe("moderate");
    expect(uvBand(7)).toBe("high");
    expect(uvBand(9)).toBe("very high");
    expect(uvBand(12)).toBe("extreme");
  });
});
