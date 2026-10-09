import { describe, expect, it } from "vitest";
import {
  aggregateAccuracy,
  latestFullMonths,
  type AccuracyRow,
} from "@/components/climate/lib/accuracy-aggregate";
import {
  computeOnsetStatus,
  countDryDays,
  onsetSentence,
} from "@/components/climate/lib/onset-status";
import { sanitizeSvg } from "@/components/climate/lib/sanitize-svg";
import { dateRange } from "@/lib/time";

const row = (month: string, mae: number | null, hit: number | null, n: number, zone = "national", lead = 1): AccuracyRow => ({
  month,
  zone,
  leadDays: lead,
  maeTmax: mae,
  maeTmin: null,
  rainHitRate: hit,
  nSamples: n,
});

describe("accuracy aggregation weighting", () => {
  it("weights monthly values by nSamples", () => {
    const [c] = aggregateAccuracy([row("2026-07-01", 1, 0.9, 100), row("2026-08-01", 2, 0.6, 300)]);
    expect(c.maeTmax).toBe(1.75); // (1×100 + 2×300) / 400
    expect(c.rainHitRate).toBe(0.675);
    expect(c.nSamples).toBe(400);
  });

  it("skips null values and zero-sample rows per metric", () => {
    const [c] = aggregateAccuracy([
      row("2026-07-01", null, 0.5, 100),
      row("2026-08-01", 3, null, 50),
      row("2026-09-01", 9, 0.1, 0),
    ]);
    expect(c.maeTmax).toBe(3);
    expect(c.rainHitRate).toBe(0.5);
    expect(c.nSamples).toBe(150);
  });

  it("groups by zone × lead day and sorts", () => {
    const out = aggregateAccuracy([
      row("2026-07-01", 1, 1, 10, "south-west", 3),
      row("2026-07-01", 1, 1, 10, "national", 7),
      row("2026-07-01", 1, 1, 10, "national", 1),
    ]);
    expect(out.map((c) => `${c.zone}:${c.leadDays}`)).toEqual(["national:1", "national:7", "south-west:3"]);
  });

  it("returns null metrics when nothing has samples", () => {
    const [c] = aggregateAccuracy([row("2026-07-01", 1, 1, 0)]);
    expect(c.maeTmax).toBeNull();
    expect(c.rainHitRate).toBeNull();
  });

  it("picks the latest full months only", () => {
    expect(
      latestFullMonths(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"], "2026-10-01"),
    ).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(latestFullMonths(["2026-10-01"], "2026-10-01")).toEqual([]);
  });
});

function series(from: string, to: string, wet: Record<string, number>) {
  return dateRange(from, to).map((date) => ({ date, rainMm: wet[date] ?? 0 }));
}

function wetFrom(start: string, days: number): Record<string, number> {
  // 8 mm every other day from start for `days` days: onset window met, no 10-day dry spell
  const out: Record<string, number> = {};
  dateRange(start, `${start.slice(0, 4)}-12-31`).slice(0, days).forEach((d, i) => {
    if (i % 2 === 0) out[d] = 12;
  });
  return out;
}

describe("farming onset status", () => {
  it("reports a late start against the normal onset", () => {
    const s = series("2026-01-01", "2026-06-30", wetFrom("2026-04-20", 70));
    const st = computeOnsetStatus({ today: "2026-07-01", series: s, normalOnsetDoy: 104, normalCessationDoy: 300 });
    expect(st.state).toBe("started");
    if (st.state !== "started") return;
    expect(st.onsetDate).toBe("2026-04-20");
    expect(st.daysVsNormal).toBe(6); // normal 14 April
    expect(onsetSentence(st)).toBe("The rains started on 20 April (6 days late).");
  });

  it("says not yet, and flags lateness once the normal date has passed", () => {
    const s = series("2026-01-01", "2026-05-09", {});
    const st = computeOnsetStatus({ today: "2026-05-10", series: s, normalOnsetDoy: 104, normalCessationDoy: 300 });
    expect(st).toEqual({ state: "not_yet", normalOnsetDate: "2026-04-14", normalPassed: true });
    expect(onsetSentence(st)).toMatch(/normally start around 14 April, so they are late/);
    const early = computeOnsetStatus({ today: "2026-03-01", series: s, normalOnsetDoy: 104, normalCessationDoy: 300 });
    expect(onsetSentence(early)).toBe("The rains have not started yet. They normally start around 14 April.");
  });

  it("declares the season over after the normal cessation + grace", () => {
    const s = series("2026-01-01", "2026-11-30", wetFrom("2026-04-14", 150));
    const st = computeOnsetStatus({ today: "2026-12-01", series: s, normalOnsetDoy: 104, normalCessationDoy: 300 });
    expect(st.state).toBe("over");
    expect(onsetSentence(st)).toMatch(/season is over.*27 October/);
  });

  it("is unknown without normals", () => {
    const st = computeOnsetStatus({ today: "2026-05-10", series: [], normalOnsetDoy: null, normalCessationDoy: null });
    expect(st.state).toBe("unknown");
  });

  it("singular day wording and on-time wording", () => {
    expect(onsetSentence({ state: "started", onsetDate: "2026-04-13", daysVsNormal: -1, normalOnsetDate: "2026-04-14" })).toBe(
      "The rains started on 13 April (1 day early).",
    );
    expect(onsetSentence({ state: "started", onsetDate: "2026-04-14", daysVsNormal: 0, normalOnsetDate: "2026-04-14" })).toBe(
      "The rains started on 14 April, right on time.",
    );
  });

  it("counts dry forecast days (< 1 mm), unknown rain is not dry", () => {
    expect(countDryDays([{ rainMm: 0 }, { rainMm: 0.9 }, { rainMm: 1 }, { rainMm: null }, { rainMm: 12 }])).toBe(2);
  });
});

describe("report SVG sanitiser", () => {
  it("keeps a plain map svg", () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0L1 1" fill="#abc"/><text x="1">Lagos</text></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it("strips scripts, handlers, links, foreignObject and js urls", () => {
    const dirty =
      '<?xml version="1.0"?><svg onload="alert(1)" viewBox="0 0 1 1"><script>alert(1)</script>' +
      '<foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)"><path d="M0 0"/></a>' +
      '<path d="M1 1" style="fill:url(http://evil)" onclick=\'x()\'/><rect fill="url(#g)" /></svg>';
    const out = sanitizeSvg(dirty)!;
    expect(out).not.toMatch(/script|onload|onclick|foreignObject|javascript|href|evil/i);
    expect(out).toContain('fill="url(#g)"');
    expect(out.startsWith("<svg")).toBe(true);
  });

  it("rejects non-svg input", () => {
    expect(sanitizeSvg("<div>hi</div>")).toBeNull();
    expect(sanitizeSvg(42)).toBeNull();
    expect(sanitizeSvg("<svg><path/></svg><script>x</script>")).toBeNull();
  });
});
