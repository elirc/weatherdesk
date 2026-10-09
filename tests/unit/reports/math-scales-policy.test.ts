import { describe, expect, it } from "vitest";
import { dayWeightedNormal, monthOverlaps, proRatedRainNormal, resolvePeriod } from "@/reports/math";
import { ANOMALY_BINS, anomalyColor, NO_DATA_COLOR, PCT_BINS, pctColor, rainColor, RAIN_BINS } from "@/reports/scales";
import { decideNarrative, decideStatus, pdfKeyFor, selectReportScopes } from "@/reports/policy";

describe("periods", () => {
  it("weekly snaps to Monday..Sunday", () => {
    expect(resolvePeriod("weekly", "2026-10-05")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(resolvePeriod("weekly", "2026-10-08")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
  });
  it("monthly is the calendar month (leap years)", () => {
    expect(resolvePeriod("monthly", "2026-09-01")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(resolvePeriod("monthly", "2028-02-01")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
  it("rejects garbage", () => {
    expect(() => resolvePeriod("weekly", "Oct 5")).toThrow();
  });
  it("month overlaps split by days", () => {
    expect(monthOverlaps("2026-09-28", "2026-10-04")).toEqual([
      { year: 2026, month: 9, days: 3, monthDays: 30 },
      { year: 2026, month: 10, days: 4, monthDays: 31 },
    ]);
  });
});

describe("weekly normal pro-rating", () => {
  const normals: Record<number, number | null> = { 9: 300, 10: 155, 11: null };
  const get = (m: number) => normals[m] ?? null;

  it("week inside one month = 7/days-in-month of the monthly normal", () => {
    expect(proRatedRainNormal("2026-10-05", "2026-10-11", get)).toBeCloseTo((155 * 7) / 31, 10);
  });
  it("week spanning months splits by days", () => {
    // 28–30 Sep (3/30 of 300) + 1–4 Oct (4/31 of 155)
    expect(proRatedRainNormal("2026-09-28", "2026-10-04", get)).toBeCloseTo(30 + 20, 10);
  });
  it("full month = monthly normal", () => {
    expect(proRatedRainNormal("2026-09-01", "2026-09-30", get)).toBeCloseTo(300, 10);
  });
  it("missing month normal → null", () => {
    expect(proRatedRainNormal("2026-10-26", "2026-11-01", get)).toBeNull();
  });
  it("temperature normal is day-weighted", () => {
    const t = (m: number) => (m === 9 ? 30 : 32);
    expect(dayWeightedNormal("2026-09-28", "2026-10-04", t)).toBeCloseTo((30 * 3 + 32 * 4) / 7, 10);
  });
});

describe("band colouring thresholds", () => {
  const below = PCT_BINS[1].color;
  const near = PCT_BINS[2].color;
  const above = PCT_BINS[3].color;
  it("79/80/120/121 follow classifyNormalBand", () => {
    expect(pctColor(79)).toBe(below);
    expect(pctColor(80)).toBe(near);
    expect(pctColor(120)).toBe(near);
    expect(pctColor(121)).toBe(above);
  });
  it("extremes and null", () => {
    expect(pctColor(0)).toBe(PCT_BINS[0].color);
    expect(pctColor(49)).toBe(PCT_BINS[0].color);
    expect(pctColor(50)).toBe(below);
    expect(pctColor(999)).toBe(PCT_BINS[PCT_BINS.length - 1].color);
    expect(pctColor(null)).toBe(NO_DATA_COLOR);
  });
  it("rain and anomaly bins include their upper bound", () => {
    expect(rainColor(0)).toBe(RAIN_BINS[0].color);
    expect(rainColor(5)).toBe(RAIN_BINS[0].color);
    expect(rainColor(5.01)).toBe(RAIN_BINS[1].color);
    expect(rainColor(500)).toBe(RAIN_BINS[RAIN_BINS.length - 1].color);
    expect(rainColor(null)).toBe(NO_DATA_COLOR);
    expect(anomalyColor(0)).toBe(ANOMALY_BINS[3].color);
    expect(anomalyColor(0.5)).toBe(ANOMALY_BINS[3].color);
    expect(anomalyColor(0.6)).toBe(ANOMALY_BINS[4].color);
    expect(anomalyColor(-3)).toBe(ANOMALY_BINS[0].color);
  });
});

describe("listReportScopes filtering", () => {
  const plans = [
    { id: "free", features: { brandedReports: false }, limits: { brandedReports: false } },
    { id: "org_basic", features: { brandedReports: true }, limits: {} },
    { id: "legacy", features: {}, limits: { brandedReports: true } },
    { id: "sms_daily", features: { dailySms: true }, limits: {} },
  ];
  const areas = [
    { id: "a-basic", organizationId: "org1" },
    { id: "a-free", organizationId: "org2" },
    { id: "a-cancelled", organizationId: "org3" },
    { id: "a-legacy", organizationId: "org4" },
    { id: "a-nosub", organizationId: "org5" },
    { id: "a-trial", organizationId: "org6" },
  ];
  const subscriptions = [
    { organizationId: "org1", planId: "org_basic", status: "active" },
    { organizationId: "org2", planId: "free", status: "active" },
    { organizationId: "org3", planId: "org_basic", status: "canceled" },
    { organizationId: "org4", planId: "legacy", status: "active" },
    { organizationId: "org6", planId: "org_basic", status: "trialing" },
    { organizationId: null, planId: "org_basic", status: "active" },
  ];
  it("national + all states + branded entitled areas only", () => {
    expect(selectReportScopes({ stateIds: [3, 1, 2], areas, subscriptions, plans })).toEqual([
      "national",
      "state:1",
      "state:2",
      "state:3",
      "area:a-basic",
      "area:a-legacy",
      "area:a-trial",
    ]);
  });
  it("no areas when no subscriptions", () => {
    expect(selectReportScopes({ stateIds: [1], areas, subscriptions: [], plans })).toEqual(["national", "state:1"]);
  });
});

describe("publish policy", () => {
  const now = new Date("2026-10-05T05:00:00Z");
  const earlier = new Date("2026-10-02T05:00:00Z");
  it("weekly publishes final immediately, keeps first publishedAt", () => {
    expect(decideStatus("weekly", undefined, null, now)).toEqual({ status: "final", publishedAt: now });
    expect(decideStatus("weekly", undefined, { status: "final", publishedAt: earlier }, now).publishedAt).toBe(earlier);
  });
  it("monthly preliminary then final refreshes publishedAt", () => {
    expect(decideStatus("monthly", "preliminary", null, now)).toEqual({ status: "preliminary", publishedAt: now });
    expect(decideStatus("monthly", undefined, null, now).status).toBe("preliminary");
    expect(decideStatus("monthly", "final", { status: "preliminary", publishedAt: earlier }, now)).toEqual({
      status: "final",
      publishedAt: now,
    });
  });
  it("monthly preliminary never downgrades final", () => {
    expect(decideStatus("monthly", "preliminary", { status: "final", publishedAt: earlier }, now)).toEqual({
      status: "final",
      publishedAt: earlier,
    });
  });
  it("editor narrative survives regeneration", () => {
    expect(decideNarrative(null, "new")).toEqual({ narrative: "new", keptEditorText: false });
    expect(decideNarrative({ narrative: "old", generatedNarrative: "old" }, "new")).toEqual({ narrative: "new", keptEditorText: false });
    expect(decideNarrative({ narrative: "edited", generatedNarrative: "old" }, "new")).toEqual({
      narrative: "edited",
      keptEditorText: true,
    });
    expect(decideNarrative({ narrative: "", generatedNarrative: undefined }, "new").narrative).toBe("new");
    expect(decideNarrative({ narrative: "legacy", generatedNarrative: undefined }, "new").keptEditorText).toBe(true);
  });
  it("pdf key", () => {
    expect(pdfKeyFor("2026-09-28", "abc")).toBe("reports/2026/abc.pdf");
  });
});
