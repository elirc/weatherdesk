import { describe, expect, it } from "vitest";
import { ARCHIVE_LEAD_DAYS } from "@/lib/weather/constants";
import { addDaysIso } from "@/lib/time";
import { archiveTargetDates, selectArchiveSnapshots, type ForecastDailyLite } from "@/worker/core/archive";

const ISSUE = "2026-10-08";

const rows: ForecastDailyLite[] = Array.from({ length: 16 }, (_, lead) => ({
  gridCellId: 5,
  date: addDaysIso(ISSUE, lead),
  rainMm: lead,
  rainProbPct: 10 * lead,
  tmaxC: 30 + lead / 10,
  tminC: 22,
}));

describe("archive lead-day snapshot", () => {
  it("maps each archived lead day to issueDate + L", () => {
    const m = archiveTargetDates(ISSUE, ARCHIVE_LEAD_DAYS);
    expect([...m.entries()]).toEqual([
      ["2026-10-09", 1],
      ["2026-10-10", 2],
      ["2026-10-11", 3],
      ["2026-10-13", 5],
      ["2026-10-15", 7],
      ["2026-10-18", 10],
      ["2026-10-22", 14],
    ]);
  });

  it("selects only the archived lead days from a 16-day run, with values copied", () => {
    const snaps = selectArchiveSnapshots(rows, ISSUE, ARCHIVE_LEAD_DAYS);
    expect(snaps.map((s) => s.leadDays)).toEqual([1, 2, 3, 5, 7, 10, 14]);
    expect(snaps.every((s) => s.issueDate === ISSUE && s.gridCellId === 5)).toBe(true);
    expect(snaps.find((s) => s.leadDays === 7)).toEqual({
      gridCellId: 5,
      issueDate: ISSUE,
      targetDate: "2026-10-15",
      leadDays: 7,
      rainMm: 7,
      rainProbPct: 70,
      tmaxC: 30.7,
      tminC: 22,
    });
  });

  it("never archives lead 0 (today) or leads past the run", () => {
    const snaps = selectArchiveSnapshots(rows.slice(0, 4), ISSUE, ARCHIVE_LEAD_DAYS);
    expect(snaps.map((s) => s.leadDays)).toEqual([1, 2, 3]);
  });
});
