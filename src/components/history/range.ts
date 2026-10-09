import { z } from "zod";
import { addDaysIso } from "@/lib/time";

/**
 * History date-range validation (pure). Shared by the history tab
 * (searchParams) and the CSV download route.
 * Rules: from ≥ 1991-01-01, to ≤ yesterday (Lagos), from ≤ to,
 * span ≤ MAX_RANGE_YEARS (clamped by moving `from` forward).
 * Invalid input never throws — it falls back to the default (last 12 months).
 */

export const HISTORY_MIN_DATE = "1991-01-01";
export const MAX_RANGE_YEARS = 5;
export const MAX_RANGE_DAYS = MAX_RANGE_YEARS * 366;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), {
    message: "invalid date",
  });

export const historyRangeSchema = z.object({
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
});

export type HistoryRange = { from: string; to: string; clamped: boolean };

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

/** Same calendar day one year earlier + 1 day (so the default is exactly 12 months). */
export function defaultFrom(to: string): string {
  const y = Number(to.slice(0, 4)) - 1;
  let candidate = `${y}${to.slice(4)}`;
  if (Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) || !new Date(`${candidate}T00:00:00Z`).toISOString().startsWith(candidate)) {
    candidate = `${y}-02-28`; // 29 Feb → 28 Feb
  }
  return addDaysIso(candidate, 1);
}

export function resolveHistoryRange(
  raw: { from?: unknown; to?: unknown },
  today: string,
): HistoryRange {
  const parsed = historyRangeSchema.parse({ from: firstString(raw.from), to: firstString(raw.to) });
  const maxDate = addDaysIso(today, -1);
  let clamped = false;
  let to = parsed.to ?? maxDate;
  if (to > maxDate) {
    to = maxDate;
    clamped = true;
  }
  if (to < HISTORY_MIN_DATE) {
    to = maxDate;
    clamped = true;
  }
  let from = parsed.from ?? defaultFrom(to);
  if (from < HISTORY_MIN_DATE) {
    from = HISTORY_MIN_DATE;
    clamped = true;
  }
  if (from > to) {
    from = defaultFrom(to);
    clamped = true;
  }
  const earliest = addDaysIso(to, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) {
    from = earliest;
    clamped = true;
  }
  return { from, to, clamped };
}
