import { addDaysIso, formatLagos, lagosMidnightUtc } from "@/lib/time";

/**
 * Pure display helpers for forecast UI. Times still go through
 * src/lib/time.ts (formatLagos*) — these only post-process its output.
 */

/** "Thu, 8 Oct" for a Lagos civil date (YYYY-MM-DD). */
export function formatDayLabel(date: string): string {
  // formatLagos → "Thu, 8 Oct, 00:00"; drop the time part
  return formatLagos(lagosMidnightUtc(date)).replace(/,?\s*\d{2}:\d{2}$/, "");
}

/** Whole days between two civil dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "Today" / "Tomorrow" / "Thu, 8 Oct". */
export function relativeDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysIso(today, 1)) return "Tomorrow";
  return formatDayLabel(date);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Meteorological direction the wind blows FROM → 8-point compass. */
export function degToCompass(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return "–";
  const norm = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(norm / 45) % 8];
}

/** Number with unit, or an en dash for missing data. */
export function fmt(value: number | null | undefined, unit: string, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const v = value.toFixed(decimals);
  return unit === "°C" || unit === "%" ? `${v}${unit}` : `${v} ${unit}`;
}

/** True when the newest forecast fetch is older than `maxHours` (provider-outage rule). */
export function isStale(fetchedAt: Date | null | undefined, now: Date, maxHours = 12): boolean {
  if (!fetchedAt) return true;
  return now.getTime() - fetchedAt.getTime() > maxHours * 3600_000;
}

/** UV index → WHO band label. */
export function uvBand(uv: number | null | undefined): string {
  if (uv === null || uv === undefined || !Number.isFinite(uv)) return "–";
  if (uv < 3) return "low";
  if (uv < 6) return "moderate";
  if (uv < 8) return "high";
  if (uv < 11) return "very high";
  return "extreme";
}
