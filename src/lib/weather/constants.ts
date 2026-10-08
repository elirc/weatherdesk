/**
 * Shared weather semantics. Import these — never re-declare the numbers.
 * Alert rule DEFAULTS are seeded into alert_rules and editable by editors;
 * the values here are the seed values and unit-test fixtures.
 */

/** A day counts as rainy at or above this total. */
export const RAINY_DAY_MM = 1.0;

/** A forecast "rain" call for accuracy scoring: probability at or above this. */
export const RAIN_CALL_PROB_PCT = 50;

/** Dry spell = at least this many consecutive days below RAINY_DAY_MM. */
export const DRY_SPELL_DAYS = 10;

/** Seed alert thresholds (editor-tunable in alert_rules). */
export const ALERT_SEED = {
  heavyRainMmPerDay: 50,
  heatTmaxC: 40,
  windGustKmh: 60,
  drySpellDays: DRY_SPELL_DAYS,
} as const;

/** Percent-of-normal buckets used by narrative templates. */
export const NORMAL_BANDS = {
  /** below this % of normal → "below normal" */
  belowPct: 80,
  /** above this % of normal → "above normal" */
  abovePct: 120,
} as const;

/** Forecast confidence label by lead day (shown on place pages). */
export function confidenceLabel(leadDays: number): "high" | "medium" | "low" {
  if (leadDays <= 2) return "high";
  if (leadDays <= 6) return "medium";
  return "low";
}

/** Normals reference period. */
export const NORMALS_START_YEAR = 1991;
export const NORMALS_END_YEAR = 2020;

/** Forecast horizon. */
export const FORECAST_DAYS = 16;
export const HOURLY_HOURS = 48;

/** Lead days snapshotted into forecast_archive each day. */
export const ARCHIVE_LEAD_DAYS = [1, 2, 3, 5, 7, 10, 14] as const;
