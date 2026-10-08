import { addDaysIso, lagosDateOf } from "@/lib/time";

/**
 * Pure calendar helpers for scheduled jobs. All dates are Africa/Lagos civil
 * dates (YYYY-MM-DD). WAT is a fixed UTC+1 with no DST.
 */

/** ISO weekday 1 (Mon) .. 7 (Sun) of a civil date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sun
  return d === 0 ? 7 : d;
}

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  return addDaysIso(date, 1 - isoWeekday(date));
}

/** Monday of the previous full Mon–Sun week relative to `lagosToday`. */
export function previousWeekStart(lagosToday: string): string {
  return addDaysIso(mondayOf(lagosToday), -7);
}

/** First day of the previous calendar month relative to `lagosToday`. */
export function previousMonthStart(lagosToday: string): string {
  const y = Number(lagosToday.slice(0, 4));
  const m = Number(lagosToday.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}-01`;
}

/** First day of the month containing `date`. */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Last day of the month starting at `monthStart`. */
export function monthEndOf(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDaysIso(next, -1);
}

/** Normalise a 'YYYY-MM' or 'YYYY-MM-DD' month input to its first day. */
export function normaliseMonth(month: string): string {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(month)) throw new Error(`invalid month '${month}'`);
  return `${month.slice(0, 7)}-01`;
}

/** Minutes since Lagos midnight for a UTC instant. */
export function lagosMinuteOfDay(now: Date): number {
  // WAT = UTC+1, fixed.
  const shifted = new Date(now.getTime() + 60 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Lagos civil date of an instant (re-exported for job code convenience). */
export const lagosDate = lagosDateOf;

/** Parse a postgres `time` string ('HH:MM' or 'HH:MM:SS') to minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x));
  return h * 60 + (m || 0);
}

/**
 * True when `sendTimeLocal` falls in the quarter-hour window starting at the
 * floor of `nowMinute` to the nearest 15 minutes: [start, start + 15).
 */
export function inQuarterHourWindow(sendTimeLocal: string, nowMinute: number): boolean {
  const start = Math.floor(nowMinute / 15) * 15;
  const t = timeToMinutes(sendTimeLocal);
  return t >= start && t < start + 15;
}
