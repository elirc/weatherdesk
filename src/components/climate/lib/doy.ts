/**
 * Day-of-year helpers for climate displays (pure, leap-safe).
 *
 * normals_season stores MEDIAN onset/cessation day-of-year over many years
 * (src/worker/core/normals.ts uses time.ts dayOfYear, i.e. 1..366 of the
 * actual year). A climatological DOY is not tied to a year, so "typical"
 * dates are shown against a fixed NON-leap reference year: DOY 60 is
 * "1 March", DOY 366 clamps to "31 December". When a concrete year is given
 * (e.g. comparing this season's onset), the real calendar of that year is
 * used, so DOY 60 in 2024 is 29 February.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Non-leap reference year for climatological (year-less) dates. */
export const REFERENCE_YEAR = 2001;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Days in a month (month 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * DOY → ISO date (YYYY-MM-DD) in the given year. DOY is rounded and clamped
 * to 1..daysInYear(year) so a median of 366 never spills into next year.
 */
export function doyToIsoDate(doy: number, year: number = REFERENCE_YEAR): string {
  const max = daysInYear(year);
  const d = Math.min(max, Math.max(1, Math.round(doy)));
  const date = new Date(Date.UTC(year, 0, d));
  return date.toISOString().slice(0, 10);
}

/** ISO date → "12 April" (no year, no time zone — civil date). */
export function formatDayMonth(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  return `${day} ${MONTHS[month - 1]}`;
}

/** DOY → "12 April" (reference year unless a year is given). */
export function doyToDayMonth(doy: number, year?: number): string {
  return formatDayMonth(doyToIsoDate(doy, year ?? REFERENCE_YEAR));
}

/** "around 12 April" — the wording used for typical onset/cessation. */
export function aroundDate(doy: number | null | undefined): string | null {
  if (doy == null || !Number.isFinite(doy)) return null;
  return `around ${doyToDayMonth(doy)}`;
}

/** Month number (1..12) → "January". */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

/** Month number (1..12) → "Jan". */
export function monthShort(month: number): string {
  return monthName(month).slice(0, 3);
}

/** Whole days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86400000);
}
