import { addDaysIso } from "@/lib/time";

/**
 * Forecast archive snapshot selection (pure). Each day at 01:30 Lagos the
 * pipeline copies the latest forecast_daily rows for the target dates
 * issueDate + L (L ∈ ARCHIVE_LEAD_DAYS) into forecast_archive.
 */

export type ForecastDailyLite = {
  gridCellId: number;
  date: string;
  rainMm: number | null;
  rainProbPct: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

export type ArchiveRow = {
  gridCellId: number;
  issueDate: string;
  targetDate: string;
  leadDays: number;
  rainMm: number | null;
  rainProbPct: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

/** The target dates to snapshot for an issue date. */
export function archiveTargetDates(issueDate: string, leadDays: readonly number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of leadDays) m.set(addDaysIso(issueDate, l), l);
  return m;
}

export function selectArchiveSnapshots(
  rows: readonly ForecastDailyLite[],
  issueDate: string,
  leadDays: readonly number[],
): ArchiveRow[] {
  const targets = archiveTargetDates(issueDate, leadDays);
  const out: ArchiveRow[] = [];
  for (const r of rows) {
    const lead = targets.get(r.date);
    if (lead === undefined) continue;
    out.push({
      gridCellId: r.gridCellId,
      issueDate,
      targetDate: r.date,
      leadDays: lead,
      rainMm: r.rainMm,
      rainProbPct: r.rainProbPct,
      tmaxC: r.tmaxC,
      tminC: r.tminC,
    });
  }
  return out;
}
