import { describe, expect, it } from "vitest";
import { dateRange, dayOfYear } from "@/lib/time";
import { computeMonthlyNormals, computeSeasonNormal, median, type NormalDay } from "@/worker/core/normals";

function year(y: number, rainOn: (date: string) => number, tmax = 32, tmin = 22): NormalDay[] {
  return dateRange(`${y}-01-01`, `${y}-12-31`).map((date) => ({ date, rainMm: rainOn(date), tmaxC: tmax, tminC: tmin }));
}

describe("monthly normals", () => {
  it("averages monthly totals and rainy days over 1991–2020 years only", () => {
    // 1995: 2 mm every day in June; 1996: 4 mm every day in June; 2021 excluded
    const days = [
      ...year(1995, (d) => (d.slice(5, 7) === "06" ? 2 : 0)),
      ...year(1996, (d) => (d.slice(5, 7) === "06" ? 4 : 0), 34, 24),
      ...year(2021, () => 100),
    ];
    const n = computeMonthlyNormals(days);
    const june = n.find((m) => m.month === 6)!;
    expect(june).toEqual({ month: 6, rainMm: 90, rainyDays: 30, tmaxC: 33, tminC: 23, nYears: 2 });
    expect(n.find((m) => m.month === 1)).toMatchObject({ rainMm: 0, rainyDays: 0 });
  });

  it("skips year-months with < 80% rain coverage", () => {
    const days = year(2000, () => 1).map((d) => (d.date.slice(5, 7) === "03" && d.date.slice(8) > "20" ? { ...d, rainMm: null } : d));
    // March has 20/31 days (65%) → no March normal
    expect(computeMonthlyNormals(days).some((m) => m.month === 3)).toBe(false);
  });
});

describe("season normals", () => {
  it("median helper", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // rounds the mean of the two middle values
  });

  it("takes the median onset / cessation DOY across years", () => {
    // each year: dry until onset, then 10 mm/day, dry after cessation
    const mk = (y: number, onset: string, cess: string) =>
      year(y, (d) => (d.slice(5) >= onset && d.slice(5) <= cess ? 10 : 0));
    const days = [
      ...mk(2001, "04-10", "10-20"),
      ...mk(2002, "04-20", "10-10"),
      ...mk(2003, "05-01", "10-30"),
      ...mk(2004, "04-15", "10-15"),
      ...mk(2005, "04-25", "10-25"),
    ];
    const s = computeSeasonNormal(days);
    expect(s.nYears).toBe(5);
    // calc.ts: a 3-day window ≥ 20 mm already holds starting the day BEFORE the
    // first 10 mm day (0+10+10), and ends the day AFTER the last one → D-1 / C+1.
    // Median year is 2002 (04-20 / 10-20 in sorted order).
    expect(s.onsetDoy).toBe(dayOfYear("2005-04-19"));
    expect(s.cessationDoy).toBe(dayOfYear("2005-10-21"));
    expect(s.seasonLengthDays).toBe((s.cessationDoy as number) - (s.onsetDoy as number));
  });
});
