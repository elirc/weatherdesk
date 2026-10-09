import { describe, expect, it } from "vitest";
import {
  aroundDate,
  daysBetween,
  daysInMonth,
  doyToDayMonth,
  doyToIsoDate,
  isLeapYear,
} from "@/components/climate/lib/doy";
import { dayOfYear } from "@/lib/time";

describe("DOY → date (leap-safe)", () => {
  it("knows leap years incl. century rules", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it("uses the real calendar when a year is given", () => {
    expect(doyToIsoDate(60, 2024)).toBe("2024-02-29");
    expect(doyToIsoDate(60, 2023)).toBe("2023-03-01");
    expect(doyToIsoDate(366, 2024)).toBe("2024-12-31");
    expect(doyToIsoDate(1, 2026)).toBe("2026-01-01");
  });

  it("uses a non-leap reference year for typical dates", () => {
    expect(doyToDayMonth(60)).toBe("1 March");
    expect(doyToDayMonth(102)).toBe("12 April");
    expect(doyToDayMonth(293)).toBe("20 October");
  });

  it("clamps out-of-range DOYs instead of spilling into another year", () => {
    expect(doyToIsoDate(366, 2023)).toBe("2023-12-31");
    expect(doyToIsoDate(0, 2023)).toBe("2023-01-01");
    expect(doyToIsoDate(400)).toBe("2001-12-31");
    expect(doyToIsoDate(104.6, 2023)).toBe("2023-04-15");
  });

  it("round-trips with time.ts dayOfYear", () => {
    for (const d of ["2024-02-29", "2024-12-31", "2023-03-01", "2026-04-12"]) {
      expect(doyToIsoDate(dayOfYear(d), Number(d.slice(0, 4)))).toBe(d);
    }
  });

  it("formats 'around …' and handles null", () => {
    expect(aroundDate(102)).toBe("around 12 April");
    expect(aroundDate(null)).toBeNull();
    expect(aroundDate(Number.NaN)).toBeNull();
  });

  it("month lengths and day differences", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-04-20", "2026-04-14")).toBe(-6);
  });
});
