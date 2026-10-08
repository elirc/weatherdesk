import { describe, expect, it } from "vitest";
import {
  cessationSearchStart,
  computeCellNormals,
  medianDoy,
  MIN_SEASON_YEARS,
  onsetSearchStart,
} from "../../../scripts/lib/normals";

describe("medianDoy", () => {
  it("odd count → middle value (input order irrelevant)", () => {
    expect(medianDoy([120, 100, 140])).toBe(120);
  });
  it("even count → rounded mean of the middle pair", () => {
    expect(medianDoy([100, 110, 121, 300])).toBe(116);
  });
  it("single value and empty", () => {
    expect(medianDoy([77])).toBe(77);
    expect(medianDoy([])).toBeNull();
  });
  it("does not mutate the input", () => {
    const v = [3, 1, 2];
    medianDoy(v);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("season search windows", () => {
  it("1 Feb in the south, 1 Apr from 9°N", () => {
    expect(onsetSearchStart(6.5, 2001)).toBe("2001-02-01");
    expect(onsetSearchStart(9.0, 2001)).toBe("2001-04-01");
    expect(cessationSearchStart(2001)).toBe("2001-09-01");
  });
});

describe("computeCellNormals (synthetic climate)", () => {
  // 10 years keeps the test quick while meeting MIN_SEASON_YEARS
  const south = computeCellNormals(6.45, 3.35, 1991, 1991 + MIN_SEASON_YEARS - 1);
  const north = computeCellNormals(12.05, 8.55, 1991, 1991 + MIN_SEASON_YEARS - 1);

  it("returns 12 months with sane values", () => {
    expect(south.monthly.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const m of south.monthly) {
      expect(m.rainMm).toBeGreaterThanOrEqual(0);
      expect(m.rainyDays).toBeLessThanOrEqual(31);
      expect(m.tmaxC).toBeGreaterThan(m.tminC);
    }
  });

  it("south is wetter than the north, with an earlier onset and longer season", () => {
    const annual = (n: typeof south) => n.monthly.reduce((a, m) => a + m.rainMm, 0);
    expect(annual(south)).toBeGreaterThan(annual(north));
    expect(south.season.onsetDoy).not.toBeNull();
    expect(north.season.onsetDoy).not.toBeNull();
    expect(south.season.onsetDoy!).toBeLessThan(north.season.onsetDoy!);
    expect(south.season.seasonLengthDays!).toBeGreaterThan(north.season.seasonLengthDays!);
  });

  it("season normal is null with fewer than MIN_SEASON_YEARS years", () => {
    const short = computeCellNormals(6.45, 3.35, 1991, 1991 + MIN_SEASON_YEARS - 2);
    expect(short.season).toEqual({ onsetDoy: null, cessationDoy: null, seasonLengthDays: null });
  });

  it("is deterministic", () => {
    expect(computeCellNormals(6.45, 3.35, 1991, 2000)).toEqual(south);
  });
});
