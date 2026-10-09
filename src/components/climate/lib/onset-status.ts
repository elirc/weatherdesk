import { detectOnset, isRainyDay, type DailyRain } from "@/lib/weather/calc";
import { ONSET_SEARCH_MMDD } from "@/worker/core/normals";
import { dayOfYear } from "@/lib/time";
import { daysBetween, doyToIsoDate, formatDayMonth } from "./doy";

/**
 * "Have the rains started?" for the farming tab (pure).
 *
 * This season's onset is detected with the same agronomic rule and the same
 * search start (ONSET_SEARCH_MMDD, 1 February) the normals pipeline used to
 * build normals_season, so "early/late" compares like with like.
 *
 * States:
 * - started:   onset detected → "started on 14 April (6 days late)"
 * - not_yet:   no onset yet and we are before the normal cessation
 * - over:      today is more than SEASON_OVER_GRACE_DAYS past the normal
 *              cessation day (with or without a detected onset)
 * - unknown:   no normals for this place (cannot compare)
 *
 * Note: the onset false-start check looks 30 days ahead, so an onset in the
 * last 30 days of data can only be confirmed when no dry spell has broken it
 * yet — detectOnset handles the truncated scan window by itself.
 */

export const SEASON_OVER_GRACE_DAYS = 14;

export type OnsetStatus =
  | {
      state: "started";
      onsetDate: string;
      /** positive = later than normal, negative = earlier */
      daysVsNormal: number | null;
      normalOnsetDate: string | null;
    }
  | { state: "not_yet"; normalOnsetDate: string | null; normalPassed: boolean }
  | { state: "over"; onsetDate: string | null; normalCessationDate: string | null }
  | { state: "unknown" };

export function seasonSearchStart(year: number): string {
  return `${year}-${ONSET_SEARCH_MMDD}`;
}

export function computeOnsetStatus(input: {
  today: string;
  series: readonly DailyRain[];
  normalOnsetDoy: number | null;
  normalCessationDoy: number | null;
}): OnsetStatus {
  const { today, series, normalOnsetDoy, normalCessationDoy } = input;
  const year = Number(today.slice(0, 4));
  const start = seasonSearchStart(year);
  const thisSeason = series.filter((d) => d.date >= start && d.date < today);
  const onsetDate = today >= start ? detectOnset([...thisSeason], start) : null;
  const normalOnsetDate = normalOnsetDoy != null ? doyToIsoDate(normalOnsetDoy, year) : null;
  const normalCessationDate =
    normalCessationDoy != null ? doyToIsoDate(normalCessationDoy, year) : null;
  const todayDoy = dayOfYear(today);

  if (normalCessationDoy != null && todayDoy > normalCessationDoy + SEASON_OVER_GRACE_DAYS) {
    return { state: "over", onsetDate, normalCessationDate };
  }
  if (onsetDate) {
    return {
      state: "started",
      onsetDate,
      daysVsNormal: normalOnsetDate ? daysBetween(normalOnsetDate, onsetDate) : null,
      normalOnsetDate,
    };
  }
  if (normalOnsetDoy == null && normalCessationDoy == null) return { state: "unknown" };
  return {
    state: "not_yet",
    normalOnsetDate,
    normalPassed: normalOnsetDoy != null && todayDoy > normalOnsetDoy,
  };
}

/** Plain-language sentence for farmers. */
export function onsetSentence(status: OnsetStatus): string {
  switch (status.state) {
    case "started": {
      const on = formatDayMonth(status.onsetDate);
      const d = status.daysVsNormal;
      if (d == null) return `The rains started on ${on}.`;
      if (d === 0) return `The rains started on ${on}, right on time.`;
      const n = Math.abs(d);
      const word = n === 1 ? "day" : "days";
      return `The rains started on ${on} (${n} ${word} ${d > 0 ? "late" : "early"}).`;
    }
    case "not_yet": {
      if (!status.normalOnsetDate) return "The rains have not started yet.";
      const normal = formatDayMonth(status.normalOnsetDate);
      return status.normalPassed
        ? `The rains have not started yet. They normally start around ${normal}, so they are late this year.`
        : `The rains have not started yet. They normally start around ${normal}.`;
    }
    case "over":
      return status.normalCessationDate
        ? `The rainy season is over for this year. It normally ends around ${formatDayMonth(status.normalCessationDate)}.`
        : "The rainy season is over for this year.";
    case "unknown":
      return "We do not yet have enough rainfall history here to say when the rains normally start.";
  }
}

/** Dry days (< RAINY_DAY_MM) in a forecast list; null rain counts as unknown, not dry. */
export function countDryDays(days: readonly { rainMm: number | null }[]): number {
  return days.filter((d) => d.rainMm != null && !isRainyDay(d.rainMm)).length;
}
