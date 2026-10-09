import { describe, expect, it } from "vitest";
import {
  accuracyText,
  alertsSentence,
  anomalyPhrase,
  buildNarrative,
  comingMonthText,
  countWith,
  extremesSentence,
  formatPeriodLabel,
  headline,
  outlookText,
  rainSentence,
  rainyDaysSentence,
  seasonSentence,
  seasonStatus,
  temperatureSentence,
} from "@/reports/narrative";
import type { ReportContent } from "@/reports/content-types";

describe("rainSentence band boundaries", () => {
  it.each([
    [79, "below normal"],
    [80, "near normal"],
    [100, "near normal"],
    [120, "near normal"],
    [121, "above normal"],
  ])("%i%% → %s", (pct, band) => {
    expect(rainSentence(40, pct)).toBe(
      `Rainfall was ${band} at ${pct}% of the 1991–2020 average, with an area-average total of 40.0 mm.`,
    );
  });

  it("matches the spec example wording", () => {
    expect(rainSentence(45.2, 134)).toBe(
      "Rainfall was above normal at 134% of the 1991–2020 average, with an area-average total of 45.2 mm.",
    );
  });

  it("handles null data", () => {
    expect(rainSentence(null, null)).toBe("Rainfall: data unavailable for this period.");
    expect(rainSentence(12, null)).toContain("data unavailable");
    expect(rainSentence(12, null)).toContain("12.0 mm");
  });
});

describe("temperature", () => {
  it("anomaly phrasing", () => {
    expect(anomalyPhrase(0.8)).toBe("0.8 °C warmer than normal");
    expect(anomalyPhrase(-1.24)).toBe("1.2 °C cooler than normal");
    expect(anomalyPhrase(0.4)).toBe("close to normal");
    expect(anomalyPhrase(-0.44)).toBe("close to normal");
    expect(anomalyPhrase(0.5)).toBe("0.5 °C warmer than normal");
    expect(anomalyPhrase(null)).toBeNull();
  });
  it("sentence", () => {
    expect(temperatureSentence(31.4, 0.8)).toBe("Daytime highs averaged 31.4 °C, 0.8 °C warmer than normal.");
    expect(temperatureSentence(null, 0.8)).toBe("Daytime temperatures: data unavailable for this period.");
    expect(temperatureSentence(30, null)).toContain("data unavailable");
  });
});

describe("singular / plural", () => {
  it("rainy days", () => {
    expect(rainyDaysSentence(1)).toBe("Locations recorded an average of 1 rainy day (1 mm or more).");
    expect(rainyDaysSentence(3)).toBe("Locations recorded an average of 3 rainy days (1 mm or more).");
    expect(rainyDaysSentence(2.5)).toContain("2.5 rainy days");
    expect(rainyDaysSentence(0)).toContain("0 rainy days");
    expect(rainyDaysSentence(null)).toBe("Rainy days: data unavailable.");
  });
  it("countWith", () => {
    expect(countWith(1, "advisory", "advisories")).toBe("1 advisory");
    expect(countWith(2, "advisory", "advisories")).toBe("2 advisories");
  });
  it("alerts", () => {
    expect(alertsSentence([])).toBe("No WeatherDesk advisories were issued during the period.");
    expect(alertsSentence([{ type: "heat", count: 0 }])).toBe("No WeatherDesk advisories were issued during the period.");
    expect(alertsSentence([{ type: "heat", count: 1 }])).toBe(
      "WeatherDesk issued 1 advisory during the period: 1 extreme heat advisory. Advisories are not official warnings.",
    );
    expect(
      alertsSentence([
        { type: "dry_spell", count: 16 },
        { type: "heat", count: 1 },
        { type: "wind", count: 2 },
      ]),
    ).toBe(
      "WeatherDesk issued 19 advisories during the period: 16 dry spell advisories, 1 extreme heat advisory and 2 strong wind advisories. Advisories are not official warnings.",
    );
  });
  it("accuracy sample count", () => {
    expect(accuracyText("September 2026", 0.11, 100, 1)).toContain("(1 forecast checked)");
    expect(accuracyText("September 2026", 0.11, 100, 22320)).toBe(
      "In September 2026, next-day maximum-temperature forecasts were off by 0.1 °C on average and 100% of next-day rain / no-rain calls verified (22,320 forecasts checked).",
    );
    expect(accuracyText("September 2026", null, null, null)).toBe("Forecast accuracy for September 2026: data unavailable.");
    expect(accuracyText("May 2026", null, 87, null)).toBe("In May 2026, 87% of next-day rain / no-rain calls verified.");
  });
});

describe("period labels", () => {
  it("weekly within a month", () => {
    expect(formatPeriodLabel("weekly", "2026-10-05", "2026-10-11")).toBe("5–11 October 2026");
  });
  it("weekly across months and years", () => {
    expect(formatPeriodLabel("weekly", "2026-09-28", "2026-10-04")).toBe("28 September – 4 October 2026");
    expect(formatPeriodLabel("weekly", "2025-12-29", "2026-01-04")).toBe("29 December 2025 – 4 January 2026");
  });
  it("monthly", () => {
    expect(formatPeriodLabel("monthly", "2026-09-01", "2026-09-30")).toBe("September 2026");
  });
});

describe("headline", () => {
  it("full", () => {
    expect(
      headline({ type: "weekly", scopeLabel: "Nigeria", periodLabel: "5–11 October 2026", rainPctOfNormal: 134, tmaxAnomalyC: 0.8 }),
    ).toBe("Rainfall above normal (134% of average) across Nigeria for 5–11 October 2026, with daytime highs 0.8 °C warmer than normal.");
  });
  it("nulls", () => {
    expect(
      headline({ type: "monthly", scopeLabel: "Lagos", periodLabel: "September 2026", rainPctOfNormal: null, tmaxAnomalyC: null }),
    ).toBe("Rainfall comparison unavailable across Lagos for September 2026.");
  });
});

describe("other templates", () => {
  it("extremes", () => {
    expect(
      extremesSentence({
        wettest: [{ name: "Uruan, Akwa Ibom", valueMm: 385.7 }],
        driest: [{ name: "Mashegu, Niger", valueMm: 36.6 }],
        hottest: [{ name: "Bursari, Yobe", valueC: 31.5 }],
      }),
    ).toBe(
      "The wettest location was Uruan, Akwa Ibom with 385.7 mm; the driest was Mashegu, Niger with 36.6 mm. The highest daytime temperature, 31.5 °C, was recorded in Bursari, Yobe.",
    );
    expect(extremesSentence({ wettest: [], driest: [], hottest: [] })).toBe("Extremes: data unavailable.");
  });

  it("outlook", () => {
    const days = [
      { date: "2026-10-06", rainMm: 2, tmaxC: 30 },
      { date: "2026-10-07", rainMm: 8.5, tmaxC: 29 },
    ];
    expect(outlookText("Nigeria", days)).toBe(
      "Over the next 2 days, forecasts point to an area-average of 10.5 mm of rain across Nigeria. The wettest day looks to be Wednesday 7 October (8.5 mm). Daytime highs should average about 29.5 °C. Forecast confidence falls with lead time.",
    );
    expect(outlookText("Nigeria", [{ date: "2026-10-06", rainMm: 0.2, tmaxC: null }])).toContain("Little or no rain");
    expect(outlookText("Nigeria", [])).toBe("Outlook: forecast data unavailable for the coming days.");
  });

  it("season status", () => {
    expect(seasonStatus(90, 85)).toBe("Onset has occurred in 90% of locations (normally 85% by now) — in line with normal.");
    expect(seasonStatus(60, 85)).toContain("behind normal");
    expect(seasonStatus(100, 50)).toContain("ahead of normal");
    expect(seasonStatus(null, 50)).toBe("Onset data unavailable.");
    expect(seasonSentence([])).toBe("Season progress: data unavailable.");
  });

  it("coming month", () => {
    expect(comingMonthText(10, "Nigeria", 96.9, 29.1)).toBe(
      "October normally brings about 96.9 mm of rain across Nigeria (1991–2020 average), with daytime highs near 29.1 °C.",
    );
    expect(comingMonthText(1, "Kano", null, null)).toBe("January normals: data unavailable.");
  });

  it("buildNarrative joins paragraphs from content numbers only", () => {
    const c: ReportContent = {
      version: 1,
      headline: "h",
      periodLabel: "5–11 October 2026",
      scopeLabel: "Nigeria",
      svgs: [],
      stats: { rainTotalMm: 10, rainPctOfNormal: 50, meanTmaxC: 30, tmaxAnomalyC: 1, rainyDays: 1 },
      extremes: { wettest: [], driest: [], hottest: [] },
      table: { rows: [], unitNote: "" },
      alertsIssued: [],
      outlook: { text: "Outlook text.", days: [] },
      methodsNote: "",
      sources: [],
    };
    const n = buildNarrative(c);
    const paras = n.split("\n\n");
    expect(paras).toHaveLength(4);
    expect(paras[0]).toContain("below normal at 50%");
    expect(paras[0]).toContain("1 rainy day ");
    expect(paras[3]).toBe("Outlook text.");
  });
});
