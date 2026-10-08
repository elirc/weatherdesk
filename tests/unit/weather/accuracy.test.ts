import { describe, expect, it } from "vitest";
import { RAIN_CALL_PROB_PCT } from "@/lib/weather/constants";
import { affectedMonths, aggregateAccuracy, zonesForCell, type AccuracyPair } from "@/worker/core/accuracy";

const pair = (p: Partial<AccuracyPair>): AccuracyPair => ({
  gridCellId: 1,
  targetDate: "2026-09-10",
  leadDays: 1,
  fcTmaxC: 30,
  fcTminC: 22,
  fcRainProbPct: 10,
  obsTmaxC: 30,
  obsTminC: 22,
  obsRainMm: 0,
  ...p,
});

const zones = new Map<number, string[]>([
  [1, ["south-west"]],
  [2, ["south-west", "north-central"]], // cell shared by LGAs in two zones
]);

describe("zone assignment", () => {
  it("adds national to every cell; cells without LGAs are national only", () => {
    expect(zonesForCell(1, zones).sort()).toEqual(["national", "south-west"]);
    expect(zonesForCell(2, zones).sort()).toEqual(["national", "north-central", "south-west"]);
    expect(zonesForCell(99, zones)).toEqual(["national"]);
  });
});

describe("aggregateAccuracy", () => {
  it("computes MAE for tmax/tmin per month/zone/lead", () => {
    const stats = aggregateAccuracy(
      [pair({ fcTmaxC: 32, obsTmaxC: 30, fcTminC: 21, obsTminC: 22 }), pair({ fcTmaxC: 29, obsTmaxC: 30, fcTminC: 22, obsTminC: 22 })],
      zones,
    );
    const sw = stats.find((s) => s.zone === "south-west")!;
    expect(sw).toMatchObject({ month: "2026-09-01", leadDays: 1, maeTmax: 1.5, maeTmin: 0.5, nSamples: 2 });
    expect(stats.find((s) => s.zone === "national")).toMatchObject({ maeTmax: 1.5, nSamples: 2 });
  });

  it("uses the 50% call threshold and the 1.0 mm rainy-day rule for hit rate", () => {
    expect(RAIN_CALL_PROB_PCT).toBe(50);
    const pairs = [
      pair({ fcRainProbPct: 50, obsRainMm: 1.0 }), // rain call, rainy → hit
      pair({ fcRainProbPct: 49, obsRainMm: 0 }), // no-rain call, dry → hit
      pair({ fcRainProbPct: 50, obsRainMm: 0.9 }), // rain call, dry → miss
      pair({ fcRainProbPct: 49.9, obsRainMm: 5 }), // no-rain call, rainy → miss
      pair({ fcRainProbPct: null, obsRainMm: 5 }), // excluded from hit rate
    ];
    const national = aggregateAccuracy(pairs, new Map()).find((s) => s.zone === "national")!;
    expect(national.rainHitRate).toBe(0.5);
    expect(national.nSamples).toBe(5);
  });

  it("separates buckets by lead day and month and counts multi-zone cells in each zone", () => {
    const stats = aggregateAccuracy(
      [
        pair({ gridCellId: 2, leadDays: 1 }),
        pair({ gridCellId: 2, leadDays: 7 }),
        pair({ gridCellId: 3, targetDate: "2026-10-01", leadDays: 1 }),
      ],
      zones,
    );
    const keys = stats.map((s) => `${s.month}|${s.zone}|${s.leadDays}|${s.nSamples}`);
    expect(keys).toEqual([
      "2026-09-01|national|1|1",
      "2026-09-01|national|7|1",
      "2026-09-01|north-central|1|1",
      "2026-09-01|north-central|7|1",
      "2026-09-01|south-west|1|1",
      "2026-09-01|south-west|7|1",
      "2026-10-01|national|1|1",
    ]);
  });

  it("returns null metrics when observations are missing", () => {
    const [s] = aggregateAccuracy([pair({ obsTmaxC: null, obsTminC: null, obsRainMm: null })], new Map());
    expect(s).toMatchObject({ maeTmax: null, maeTmin: null, rainHitRate: null, nSamples: 1 });
  });
});

describe("affectedMonths", () => {
  it("is yesterday's month plus months of newly finalised dates", () => {
    expect(affectedMonths("2026-10-01", ["2026-09-28", "2026-09-29", "2026-08-31"])).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(affectedMonths("2026-10-07", [])).toEqual(["2026-10-01"]);
  });
});
