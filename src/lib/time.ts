/**
 * Storage is always UTC (timestamptz). Display is always Africa/Lagos
 * (WAT, fixed UTC+1, no DST). Use these helpers for ALL user-facing times —
 * never raw toLocaleString in components.
 */

export const LAGOS_TZ = "Africa/Lagos";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAGOS_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAGOS_TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAGOS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: LAGOS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** e.g. "Mon, 6 Oct, 14:00" (WAT) */
export function formatLagos(d: Date): string {
  return dateTimeFmt.format(d);
}

/** e.g. "6 October 2026" */
export function formatLagosDate(d: Date): string {
  return dateFmt.format(d);
}

/** e.g. "14:00" */
export function formatLagosTime(d: Date): string {
  return timeFmt.format(d);
}

/** Civil date (YYYY-MM-DD) in Lagos for a UTC instant. */
export function lagosDateOf(d: Date): string {
  return isoDateFmt.format(d);
}

/** Today's civil date in Lagos. */
export function lagosToday(): string {
  return lagosDateOf(new Date());
}

/** Midnight Lagos of a civil date, as a UTC instant (WAT is fixed UTC+1). */
export function lagosMidnightUtc(date: string): Date {
  return new Date(`${date}T00:00:00+01:00`);
}

/** Human age of a timestamp, e.g. "3 h ago", for DataAge labels. */
export function ageLabel(d: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD between two dates. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  while (d <= end) {
    out.push(d);
    d = addDaysIso(d, 1);
  }
  return out;
}

/** Day of year 1..366 for a YYYY-MM-DD string. */
export function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}
