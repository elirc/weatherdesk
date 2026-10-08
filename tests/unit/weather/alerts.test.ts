import { describe, expect, it } from "vitest";
import { ALERT_SEED } from "@/lib/weather/constants";
import {
  composedDrySpell,
  dedupeAgainstExisting,
  evaluateAlerts,
  inSeason,
  leadingDryDays,
  renderTemplate,
  triggerWindows,
  triggers,
  windowInstants,
  type AlertRuleLite,
  type CellInputs,
  type ForecastDayLite,
} from "@/worker/core/alerts";
import { addDaysIso, dateRange, dayOfYear } from "@/lib/time";

const TODAY = "2026-07-01"; // DOY 182 — inside a typical rainy season
const day = (offset: number, v: Partial<ForecastDayLite> = {}): ForecastDayLite => ({
  date: addDaysIso(TODAY, offset),
  rainMm: 0,
  tmaxC: 30,
  gustsMaxKmh: 20,
  ...v,
});

const rule = (type: AlertRuleLite["type"], threshold: number): AlertRuleLite => ({
  id: `rule-${type}`,
  type,
  threshold,
  severity: "moderate",
  template: "{lga}: {value} vs {threshold} on {date}",
  enabled: true,
});

const RULES = [
  rule("heavy_rain", ALERT_SEED.heavyRainMmPerDay),
  rule("heat", ALERT_SEED.heatTmaxC),
  rule("wind", ALERT_SEED.windGustKmh),
  rule("dry_spell", ALERT_SEED.drySpellDays),
];

describe("threshold boundaries (seeded 50 mm / 40 °C / 60 km/h)", () => {
  it("heavy rain triggers at exactly 50 mm, not at 49.9", () => {
    expect(triggers("heavy_rain", day(0, { rainMm: 50 }), 50)).toBe(true);
    expect(triggers("heavy_rain", day(0, { rainMm: 49.9 }), 50)).toBe(false);
    expect(triggers("heavy_rain", day(0, { rainMm: 50.1 }), 50)).toBe(true);
  });
  it("heat triggers at exactly 40 °C, not at 39.9", () => {
    expect(triggers("heat", day(0, { tmaxC: 40 }), 40)).toBe(true);
    expect(triggers("heat", day(0, { tmaxC: 39.9 }), 40)).toBe(false);
  });
  it("wind triggers at exactly 60 km/h gusts, not at 59.9", () => {
    expect(triggers("wind", day(0, { gustsMaxKmh: 60 }), 60)).toBe(true);
    expect(triggers("wind", day(0, { gustsMaxKmh: 59.9 }), 60)).toBe(false);
  });
  it("null forecast values never trigger", () => {
    expect(triggers("heavy_rain", day(0, { rainMm: null }), 50)).toBe(false);
    expect(triggers("heat", day(0, { tmaxC: null }), 40)).toBe(false);
    expect(triggers("wind", day(0, { gustsMaxKmh: null }), 60)).toBe(false);
  });
});

describe("trigger windows", () => {
  it("merges consecutive days and keeps the window max", () => {
    const fc = [day(0), day(1, { rainMm: 55 }), day(2, { rainMm: 72.4 }), day(3), day(4, { rainMm: 50 })];
    expect(triggerWindows("heavy_rain", fc, 50)).toEqual([
      { first: addDaysIso(TODAY, 1), last: addDaysIso(TODAY, 2), value: 72.4 },
      { first: addDaysIso(TODAY, 4), last: addDaysIso(TODAY, 4), value: 50 },
    ]);
  });
  it("window instants cover whole Lagos days [00:00 WAT, next 00:00 WAT)", () => {
    const w = windowInstants("2026-07-02", "2026-07-03");
    expect(w.validFrom.toISOString()).toBe("2026-07-01T23:00:00.000Z");
    expect(w.validTo.toISOString()).toBe("2026-07-03T23:00:00.000Z");
  });
});

describe("dry spell composition (observed tail + forecast head)", () => {
  const obs = (rains: number[]) => rains.map((r, i) => ({ date: addDaysIso(TODAY, i - rains.length), rainMm: r }));

  it("counts the observed dry tail plus leading forecast dry days", () => {
    const observed = obs([5, 12, 0, 0, 0.5, 0, 0, 0.9]); // trailing 6 dry (<1.0mm)
    const forecast = [day(0), day(1), day(2), day(3, { rainMm: 0.99 }), day(4, { rainMm: 1.0 }), day(5)];
    expect(composedDrySpell(observed, forecast)).toEqual({ observedDays: 6, forecastDays: 4, total: 10 });
    expect(leadingDryDays(forecast)).toBe(4);
  });

  it("triggers at exactly the threshold (10) and not at 9", () => {
    const lgas = [{ id: 1, name: "Ikeja", gridCellId: 100 }];
    const season = { onsetDoy: 90, cessationDoy: 300 };
    const fc10: CellInputs = {
      observed: obs([10, 0, 0, 0, 0, 0, 0]), // 6 dry
      forecast: [day(0), day(1), day(2), day(3), day(4, { rainMm: 8 }), day(5), day(6)], // 4 dry
      season,
    };
    const fc9: CellInputs = { ...fc10, forecast: [day(0), day(1), day(2), day(3, { rainMm: 8 })] };
    const dry = [rule("dry_spell", 10)];

    const hit = evaluateAlerts({ today: TODAY, rules: dry, lgas, cells: new Map([[100, fc10]]) });
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ type: "dry_spell", value: 10, firstDate: TODAY, lastDate: addDaysIso(TODAY, 3) });
    expect(hit[0].text).toBe(`Ikeja: 10 vs 10 on 1 July 2026 to 4 July 2026`);

    expect(evaluateAlerts({ today: TODAY, rules: dry, lgas, cells: new Map([[100, fc9]]) })).toHaveLength(0);
  });

  it("only fires inside the rainy season window, and never without season normals", () => {
    const allDry: CellInputs = {
      observed: dateRange(addDaysIso(TODAY, -20), addDaysIso(TODAY, -1)).map((d) => ({ date: d, rainMm: 0 })),
      forecast: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i)),
      season: { onsetDoy: 200, cessationDoy: 280 }, // TODAY (182) is before onset
    };
    const lgas = [{ id: 1, name: "Sokoto North", gridCellId: 7 }];
    const dry = [rule("dry_spell", 10)];
    expect(evaluateAlerts({ today: TODAY, rules: dry, lgas, cells: new Map([[7, allDry]]) })).toHaveLength(0);
    expect(
      evaluateAlerts({ today: TODAY, rules: dry, lgas, cells: new Map([[7, { ...allDry, season: null }]]) }),
    ).toHaveLength(0);
    const inside = evaluateAlerts({
      today: TODAY,
      rules: dry,
      lgas,
      cells: new Map([[7, { ...allDry, season: { onsetDoy: dayOfYear(TODAY), cessationDoy: 280 } }]]),
    });
    expect(inside).toHaveLength(1);
    expect(inside[0].value).toBe(27); // 20 observed + 7 forecast
  });

  it("inSeason handles inclusive bounds and wrap-around", () => {
    expect(inSeason(90, { onsetDoy: 90, cessationDoy: 300 })).toBe(true);
    expect(inSeason(300, { onsetDoy: 90, cessationDoy: 300 })).toBe(true);
    expect(inSeason(301, { onsetDoy: 90, cessationDoy: 300 })).toBe(false);
    expect(inSeason(10, { onsetDoy: 330, cessationDoy: 40 })).toBe(true);
    expect(inSeason(100, { onsetDoy: 330, cessationDoy: 40 })).toBe(false);
    expect(inSeason(100, { onsetDoy: null, cessationDoy: 40 })).toBe(false);
  });
});

describe("evaluateAlerts", () => {
  const lgas = [
    { id: 1, name: "Ikeja", gridCellId: 100 },
    { id: 2, name: "Kano Municipal", gridCellId: 200 },
    { id: 3, name: "No Cell", gridCellId: null },
  ];
  const cells = new Map<number, CellInputs>([
    [100, { observed: [], forecast: [day(0), day(2, { rainMm: 50, gustsMaxKmh: 60 }), day(7, { rainMm: 90 })], season: null }],
    [200, { observed: [], forecast: [day(1, { tmaxC: 40 }), day(2, { tmaxC: 41.5 })], season: null }],
  ]);

  it("evaluates every enabled rule per LGA within the 7-day horizon", () => {
    const out = evaluateAlerts({ today: TODAY, rules: RULES, lgas, cells });
    const summary = out.map((a) => `${a.lgaId}:${a.type}:${a.firstDate}..${a.lastDate}:${a.value}`).sort();
    expect(summary).toEqual([
      `1:heavy_rain:${addDaysIso(TODAY, 2)}..${addDaysIso(TODAY, 2)}:50`, // day 7 (90mm) is beyond the horizon
      `1:wind:${addDaysIso(TODAY, 2)}..${addDaysIso(TODAY, 2)}:60`,
      `2:heat:${addDaysIso(TODAY, 1)}..${addDaysIso(TODAY, 2)}:41.5`,
    ]);
  });

  it("skips disabled rules", () => {
    const rules = RULES.map((r) => ({ ...r, enabled: r.type !== "heat" }));
    expect(evaluateAlerts({ today: TODAY, rules, lgas, cells }).some((a) => a.type === "heat")).toBe(false);
  });

  it("renders the rule template", () => {
    expect(
      renderTemplate("Heavy rain ({value} mm, ≥{threshold}) expected in {lga} on {date}. {unknown}", {
        lga: "Ikeja",
        value: 72.44,
        threshold: 50,
        date: "3 July 2026",
      }),
    ).toBe("Heavy rain (72.4 mm, ≥50) expected in Ikeja on 3 July 2026. {unknown}");
  });
});

describe("idempotency (overlap dedupe)", () => {
  const [c] = evaluateAlerts({
    today: TODAY,
    rules: [rule("heavy_rain", 50)],
    lgas: [{ id: 1, name: "Ikeja", gridCellId: 100 }],
    cells: new Map([[100, { observed: [], forecast: [day(1, { rainMm: 60 })], season: null }]]),
  });

  it("skips a candidate overlapping an existing alert of the same LGA and type", () => {
    expect(dedupeAgainstExisting([c], [{ lgaId: 1, type: "heavy_rain", validFrom: c.validFrom, validTo: c.validTo }])).toEqual([]);
  });
  it("keeps it when type, LGA or window differ (touching windows do not overlap)", () => {
    expect(dedupeAgainstExisting([c], [{ lgaId: 1, type: "wind", validFrom: c.validFrom, validTo: c.validTo }])).toHaveLength(1);
    expect(dedupeAgainstExisting([c], [{ lgaId: 2, type: "heavy_rain", validFrom: c.validFrom, validTo: c.validTo }])).toHaveLength(1);
    expect(
      dedupeAgainstExisting([c], [{ lgaId: 1, type: "heavy_rain", validFrom: new Date(c.validFrom.getTime() - 86400000), validTo: c.validFrom }]),
    ).toHaveLength(1);
  });
  it("dedupes within the batch too", () => {
    expect(dedupeAgainstExisting([c, { ...c }], [])).toHaveLength(1);
  });
});
