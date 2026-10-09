import { describe, expect, it } from "vitest";
import {
  csvField,
  historyCsvFilename,
  historyCsvHeader,
  historyCsvRow,
} from "@/components/history/csv";
import { HISTORY_MIN_DATE, resolveHistoryRange } from "@/components/history/range";

describe("history CSV formatting", () => {
  it("writes a header with source + preliminary columns", () => {
    expect(historyCsvHeader()).toBe(
      "date,rain_mm,tmax_c,tmin_c,humidity_pct,wind_kmh,source,preliminary\r\n",
    );
  });

  it("formats a row with nulls as empty fields", () => {
    expect(
      historyCsvRow({
        date: "2026-10-07",
        rainMm: 12.345,
        tmaxC: 31.2,
        tminC: null,
        humidityPct: 80,
        windKmh: null,
        source: "model_estimate",
        preliminary: true,
      }),
    ).toBe("2026-10-07,12.35,31.2,,80,,model_estimate,true\r\n");
  });

  it("quotes and escapes per RFC 4180 and neutralises formulas", () => {
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(-3.5)).toBe("-3.5");
    expect(csvField(Number.NaN)).toBe("");
    expect(csvField(false)).toBe("false");
  });

  it("builds a descriptive filename", () => {
    expect(historyCsvFilename(431, "2025-10-08", "2026-10-07")).toBe(
      "weatherdesk-history-cell431-2025-10-08_2026-10-07.csv",
    );
  });
});

describe("history range validation", () => {
  const today = "2026-10-08";

  it("defaults to the last 12 months ending yesterday", () => {
    expect(resolveHistoryRange({}, today)).toEqual({ from: "2025-10-08", to: "2026-10-07", clamped: false });
  });

  it("falls back on garbage input without throwing", () => {
    expect(resolveHistoryRange({ from: "nope", to: "2026-02-30" }, today)).toEqual({
      from: "2025-10-08",
      to: "2026-10-07",
      clamped: false,
    });
  });

  it("clamps to yesterday, the 1991 floor and a 5-year span", () => {
    expect(resolveHistoryRange({ to: "2030-01-01" }, today).to).toBe("2026-10-07");
    const floor = resolveHistoryRange({ from: "1980-01-01", to: "1995-12-31" }, today);
    expect(floor).toEqual({ from: HISTORY_MIN_DATE, to: "1995-12-31", clamped: true });
    const r = resolveHistoryRange({ from: "1991-01-01", to: "2000-12-31" }, today);
    expect(r.to).toBe("2000-12-31");
    expect(r.from).toBe("1995-12-29"); // 5 × 366 days inclusive, ending on `to`
    expect(r.clamped).toBe(true);
  });

  it("repairs from > to", () => {
    const r = resolveHistoryRange({ from: "2026-05-01", to: "2026-04-01" }, today);
    expect(r).toEqual({ from: "2025-04-02", to: "2026-04-01", clamped: true });
  });

  it("accepts array-valued searchParams (first wins)", () => {
    const r = resolveHistoryRange({ from: ["2026-01-01", "x"], to: "2026-01-31" }, today);
    expect(r).toEqual({ from: "2026-01-01", to: "2026-01-31", clamped: false });
  });

  it("handles a 29 February end date for the default span", () => {
    const r = resolveHistoryRange({ to: "2024-02-29" }, today);
    expect(r.from).toBe("2023-03-01");
  });
});
