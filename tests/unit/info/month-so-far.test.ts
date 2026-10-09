import { describe, expect, it } from "vitest";
import {
  computeMonthSoFar,
  formatAnomalyC,
  proRate,
  proRateFactor,
  type MonthSoFarDay,
} from "@/components/climate/lib/month-so-far";

const day = (date: string, rainMm: number | null, tmaxC: number | null, preliminary = false): MonthSoFarDay => ({
  date,
  rainMm,
  tmaxC,
  tminC: 22,
  source: preliminary ? "model_estimate" : "nasa_power",
  preliminary,
});

describe("month-so-far pro-rating", () => {
  it("pro-rates by covered days over month length", () => {
    expect(proRateFactor(7, 31)).toBeCloseTo(7 / 31);
    expect(proRate(310, 7, 31)).toBe(70);
    expect(proRate(100, 14, 28)).toBe(50);
    expect(proRate(null, 7, 31)).toBeNull();
    expect(proRateFactor(40, 30)).toBe(1);
    expect(proRateFactor(5, 0)).toBe(0);
  });

  it("compares observed rain with the pro-rated normal", () => {
    const days = [
      day("2026-10-01", 10, 30),
      day("2026-10-02", 0, 31),
      day("2026-10-03", 25, 29),
      day("2026-10-04", 0.4, 32),
      day("2026-10-05", 5, 30),
      day("2026-10-06", 0, 30),
      day("2026-10-07", 30, 28, true),
    ];
    const r = computeMonthSoFar("2026-10", days, { rainMm: 155, rainyDays: 15.5, tmaxC: 29, tminC: 22 });
    expect(r.daysInMonth).toBe(31);
    expect(r.daysCovered).toBe(7);
    expect(r.rainTotalMm).toBe(70.4);
    expect(r.normalToDateMm).toBe(35); // 155 × 7/31
    expect(r.rainPctOfNormal).toBe(201);
    expect(r.band).toBe("above normal");
    expect(r.rainyDays).toBe(4);
    expect(r.normalRainyDaysToDate).toBe(3.5);
    expect(r.meanTmaxC).toBe(30);
    expect(r.tmaxAnomalyC).toBe(1);
    expect(r.preliminary).toBe(true);
    expect(r.sources.sort()).toEqual(["model_estimate", "nasa_power"]);
    expect(r.nMissing).toBe(0);
  });

  it("counts a gap inside the span as missing, not as a shorter month", () => {
    const r = computeMonthSoFar(
      "2026-02",
      [day("2026-02-01", 1, 30), day("2026-02-04", 1, 30)],
      { rainMm: 28, rainyDays: 2, tmaxC: 31, tminC: 20 },
    );
    expect(r.daysInMonth).toBe(28);
    expect(r.daysCovered).toBe(4);
    expect(r.nMissing).toBe(2);
    expect(r.normalToDateMm).toBe(4);
    expect(r.rainPctOfNormal).toBe(50);
    expect(r.band).toBe("below normal");
  });

  it("ignores rows from other months and handles an empty month", () => {
    const r = computeMonthSoFar("2026-10", [day("2026-09-30", 50, 30)], {
      rainMm: 100,
      rainyDays: 10,
      tmaxC: 30,
      tminC: 21,
    });
    expect(r.daysCovered).toBe(0);
    expect(r.normalToDateMm).toBeNull();
    expect(r.rainPctOfNormal).toBeNull();
    expect(r.band).toBeNull();
    expect(r.lastDate).toBeNull();
  });

  it("survives missing normals", () => {
    const r = computeMonthSoFar("2026-10", [day("2026-10-01", 3, 30)], null);
    expect(r.rainTotalMm).toBe(3);
    expect(r.normalToDateMm).toBeNull();
    expect(r.tmaxAnomalyC).toBeNull();
  });

  it("formats anomalies with explicit sign and unit", () => {
    expect(formatAnomalyC(1.24)).toBe("+1.2 °C");
    expect(formatAnomalyC(-0.4)).toBe("−0.4 °C");
    expect(formatAnomalyC(0)).toBe("0.0 °C");
    expect(formatAnomalyC(null)).toBe("—");
  });
});
