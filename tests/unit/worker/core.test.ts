import { describe, expect, it } from "vitest";
import { callsSpent, isOverBudget, monthKeyOf } from "@/worker/core/budget";
import { chunk, chunkKey, yearChunks } from "@/worker/core/chunk";
import { isNotImplemented } from "@/worker/core/errors";
import {
  inQuarterHourWindow,
  isoWeekday,
  lagosMinuteOfDay,
  monthEndOf,
  normaliseMonth,
  previousMonthStart,
  previousWeekStart,
  timeToMinutes,
} from "@/worker/core/periods";
import { NASA_LAG_DAYS, SOURCE_FINAL, SOURCE_PRELIMINARY, toObservedRows, topUpRange } from "@/worker/core/observed";
import { alertEmail, dailyForecastText, escapeHtml, parsePayload, renderEmailHtml } from "@/worker/core/messages";

describe("monthly budget guard", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  it("blocks at and above the budget, allows below", () => {
    expect(isOverBudget({ monthKey: "2026-10", callsThisMonth: 999 }, 1000, now)).toBe(false);
    expect(isOverBudget({ monthKey: "2026-10", callsThisMonth: 1000 }, 1000, now)).toBe(true);
    expect(isOverBudget({ monthKey: "2026-10", callsThisMonth: 1500 }, 1000, now)).toBe(true);
  });
  it("treats last month's counter and a missing row as zero", () => {
    expect(callsSpent({ monthKey: "2026-09", callsThisMonth: 5000 }, now)).toBe(0);
    expect(isOverBudget({ monthKey: "2026-09", callsThisMonth: 5000 }, 1000, now)).toBe(false);
    expect(isOverBudget(undefined, 1000, now)).toBe(false);
    expect(isOverBudget(null, 1, now)).toBe(false);
  });
  it("refuses a batch that would overshoot", () => {
    expect(isOverBudget({ monthKey: "2026-10", callsThisMonth: 990 }, 1000, now, 10)).toBe(false);
    expect(isOverBudget({ monthKey: "2026-10", callsThisMonth: 990 }, 1000, now, 11)).toBe(true);
  });
  it("month key is UTC YYYY-MM (matches src/lib/ops.ts)", () => {
    expect(monthKeyOf(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10");
  });
});

describe("chunking", () => {
  it("chunks cells by maxPointsPerCall", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
    expect(chunkKey([3, 9, 12])).toBe("cells:3-12:3");
  });
  it("splits backfill ranges by calendar year", () => {
    expect(yearChunks("2019-06-01", "2021-02-03")).toEqual([
      { start: "2019-06-01", end: "2019-12-31" },
      { start: "2020-01-01", end: "2020-12-31" },
      { start: "2021-01-01", end: "2021-02-03" },
    ]);
    expect(yearChunks("2020-03-01", "2020-03-01")).toEqual([{ start: "2020-03-01", end: "2020-03-01" }]);
    expect(yearChunks("2021-01-01", "2020-01-01")).toEqual([]);
  });
});

describe("report periods (Lagos)", () => {
  it("previous full Mon–Sun week", () => {
    expect(isoWeekday("2026-10-05")).toBe(1); // Monday
    expect(previousWeekStart("2026-10-05")).toBe("2026-09-28"); // run on Monday
    expect(previousWeekStart("2026-10-11")).toBe("2026-09-28"); // Sunday, same week
    expect(previousWeekStart("2026-10-12")).toBe("2026-10-05");
  });
  it("previous calendar month incl. year rollover", () => {
    expect(previousMonthStart("2026-10-02")).toBe("2026-09-01");
    expect(previousMonthStart("2026-01-10")).toBe("2025-12-01");
    expect(monthEndOf("2024-02-01")).toBe("2024-02-29");
    expect(monthEndOf("2026-12-01")).toBe("2026-12-31");
    expect(normaliseMonth("2026-09")).toBe("2026-09-01");
    expect(() => normaliseMonth("Sept")).toThrow();
  });
});

describe("daily-send quarter-hour window", () => {
  it("Lagos minute of day is UTC+1", () => {
    expect(lagosMinuteOfDay(new Date("2026-10-08T05:07:00Z"))).toBe(6 * 60 + 7);
    expect(lagosMinuteOfDay(new Date("2026-10-08T23:30:00Z"))).toBe(30);
  });
  it("matches send times in [floor15(now), +15)", () => {
    const now = 6 * 60 + 7; // 06:07 → window 06:00–06:14
    expect(inQuarterHourWindow("06:00:00", now)).toBe(true);
    expect(inQuarterHourWindow("06:14:59", now)).toBe(true);
    expect(inQuarterHourWindow("06:15:00", now)).toBe(false);
    expect(inQuarterHourWindow("05:59", now)).toBe(false);
    expect(timeToMinutes("18:45")).toBe(18 * 60 + 45);
  });
});

describe("observed merge rules", () => {
  it("top-up runs from the day after the last final date to today-2", () => {
    expect(NASA_LAG_DAYS).toBe(2);
    expect(topUpRange("2026-10-01", "2026-10-08")).toEqual({ start: "2026-10-02", end: "2026-10-06" });
    expect(topUpRange("2026-10-06", "2026-10-08")).toBeNull();
    // no final data at all: capped to the last 30 days
    expect(topUpRange(null, "2026-10-08")).toEqual({ start: "2026-09-08", end: "2026-10-06" });
    expect(topUpRange("2020-01-01", "2026-10-08")?.start).toBe("2026-09-08");
  });
  it("tags provenance and drops all-null provider gaps", () => {
    const days = [
      { date: "2026-10-04", rainMm: 5.9, tmaxC: 28, tminC: 24, humidityPct: 86, windKmh: 7, solarMjM2: null },
      { date: "2026-10-05", rainMm: null, tmaxC: null, tminC: null, humidityPct: 80, windKmh: 7, solarMjM2: null },
    ];
    const fin = toObservedRows(9, days, "final");
    expect(fin).toHaveLength(1);
    expect(fin[0]).toMatchObject({ gridCellId: 9, date: "2026-10-04", source: SOURCE_FINAL, preliminary: false });
    expect(toObservedRows(9, days, "preliminary")[0]).toMatchObject({ source: SOURCE_PRELIMINARY, preliminary: true });
    expect(SOURCE_FINAL).toBe("nasa_power");
    expect(SOURCE_PRELIMINARY).toBe("model_estimate");
  });
});

describe("messages", () => {
  it("daily forecast SMS fits one segment for a typical place", () => {
    const t = dailyForecastText("Ikeja", {
      date: "2026-10-08",
      tmaxC: 31.4,
      tminC: 23.6,
      rainMm: 12.34,
      rainProbPct: 70,
      gustsMaxKmh: 35.2,
    });
    expect(t).toBe("WeatherDesk Ikeja 8 October 2026: 24-31C, rain 12.3mm (70%), gusts 35km/h. Not an official NiMet warning.");
    expect(t.length).toBeLessThanOrEqual(160);
  });
  it("alert email carries the NiMet disclaimer", () => {
    const m = alertEmail({ lgaName: "Ikeja", type: "heavy_rain", text: "Heavy rain expected.", appUrl: "http://x" });
    expect(m.subject).toBe("WeatherDesk advisory: Heavy rain - Ikeja");
    expect(m.text).toContain("not affiliated with NiMet");
  });
  it("escapes HTML in rendered emails", () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    expect(renderEmailHtml("S<", "a\n\nb<script>", "http://x")).not.toContain("<script>");
  });
  it("validates notification payloads", () => {
    expect(parsePayload({ text: "hi", to: "+234" })).toMatchObject({ text: "hi" });
    expect(() => parsePayload({})).toThrow(/text/);
    expect(() => parsePayload(null)).toThrow();
  });
});

describe("report engine stub detection", () => {
  it("recognises the A5 stub error", () => {
    expect(isNotImplemented(new Error("reports engine not implemented yet (A5)"))).toBe(true);
    expect(isNotImplemented(new Error("connection refused"))).toBe(false);
  });
});
