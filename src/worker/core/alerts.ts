import { isRainyDay, trailingDryDays, type DailyRain } from "@/lib/weather/calc";
import { addDaysIso, dayOfYear, formatLagosDate, lagosMidnightUtc } from "@/lib/time";

/**
 * Alert rule evaluation (pure). The DB shell (src/worker/jobs/alerts.ts)
 * loads rules, the next 7 days of forecast_daily per cell, the last 20 days
 * of observed_daily and normals_season, then calls evaluateAlerts().
 *
 * Semantics (brief + CONVENTIONS):
 * - heavy_rain: forecast rainMm ≥ threshold
 * - heat:       forecast tmaxC ≥ threshold
 * - wind:       forecast gustsMaxKmh ≥ threshold
 * - dry_spell:  trailingDryDays(observed last 20d) + leading forecast dry
 *               days ≥ threshold, only inside the cell's rainy-season window
 *               (normals_season onset..cessation DOY). Cells without season
 *               normals are not evaluated for dry spells (a dry spell outside
 *               the rains is the normal dry season, not an advisory).
 * Consecutive triggering days merge into one window per LGA/type.
 */

export type AlertType = "heavy_rain" | "heat" | "wind" | "dry_spell";

export type AlertRuleLite = {
  id: string;
  type: AlertType;
  threshold: number;
  severity: "moderate" | "high";
  template: string;
  enabled: boolean;
};

export type ForecastDayLite = {
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  gustsMaxKmh: number | null;
};

export type SeasonWindow = { onsetDoy: number | null; cessationDoy: number | null } | null | undefined;

export type LgaLite = { id: number; name: string; gridCellId: number | null };

export type CellInputs = {
  /** forecast_daily from today forward (ascending); only the first 7 are used */
  forecast: ForecastDayLite[];
  /** observed_daily up to yesterday (ascending), last ~20 days */
  observed: DailyRain[];
  season: SeasonWindow;
};

export type AlertCandidate = {
  lgaId: number;
  ruleId: string;
  type: AlertType;
  severity: "moderate" | "high";
  /** first and last affected Lagos civil dates (inclusive) */
  firstDate: string;
  lastDate: string;
  validFrom: Date;
  validTo: Date;
  value: number;
  text: string;
};

export const ALERT_FORECAST_DAYS = 7;
export const DRY_SPELL_OBSERVED_DAYS = 20;

/** Does the forecast value trigger the rule? Inclusive (≥) at the threshold; null never triggers. */
export function triggers(type: Exclude<AlertType, "dry_spell">, day: ForecastDayLite, threshold: number): boolean {
  const v = metricValue(type, day);
  return v != null && v >= threshold;
}

export function metricValue(type: Exclude<AlertType, "dry_spell">, day: ForecastDayLite): number | null {
  switch (type) {
    case "heavy_rain":
      return day.rainMm;
    case "heat":
      return day.tmaxC;
    case "wind":
      return day.gustsMaxKmh;
  }
}

/** Is a day-of-year within the rainy season window (inclusive)? Handles wrap-around. */
export function inSeason(doy: number, season: SeasonWindow): boolean {
  if (!season || season.onsetDoy == null || season.cessationDoy == null) return false;
  const { onsetDoy: on, cessationDoy: off } = season;
  return on <= off ? doy >= on && doy <= off : doy >= on || doy <= off;
}

/** Consecutive non-rainy days at the START of the forecast series. */
export function leadingDryDays(forecast: readonly { rainMm: number | null }[]): number {
  let n = 0;
  for (const d of forecast) {
    if (isRainyDay(d.rainMm)) break;
    n += 1;
  }
  return n;
}

/** Dry spell length composed of observed tail + forecast head. */
export function composedDrySpell(observed: DailyRain[], forecast: readonly { rainMm: number | null }[]): {
  observedDays: number;
  forecastDays: number;
  total: number;
} {
  const observedDays = trailingDryDays(observed);
  const forecastDays = leadingDryDays(forecast);
  return { observedDays, forecastDays, total: observedDays + forecastDays };
}

export function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatDateWindow(first: string, last: string): string {
  const a = formatLagosDate(lagosMidnightUtc(first));
  if (first === last) return a;
  return `${a} to ${formatLagosDate(lagosMidnightUtc(last))}`;
}

/** Fill {lga}, {value}, {threshold}, {date} placeholders. Unknown placeholders are left as-is. */
export function renderTemplate(
  template: string,
  vars: { lga: string; value: number; threshold: number; date: string },
): string {
  return template
    .replaceAll("{lga}", vars.lga)
    .replaceAll("{value}", formatValue(vars.value))
    .replaceAll("{threshold}", formatValue(vars.threshold))
    .replaceAll("{date}", vars.date);
}

/** Group consecutive triggering forecast days into windows with the window max value. */
export function triggerWindows(
  type: Exclude<AlertType, "dry_spell">,
  forecast: readonly ForecastDayLite[],
  threshold: number,
): { first: string; last: string; value: number }[] {
  const out: { first: string; last: string; value: number }[] = [];
  let cur: { first: string; last: string; value: number } | null = null;
  for (const d of forecast) {
    const v = metricValue(type, d);
    if (v != null && v >= threshold) {
      if (cur && addDaysIso(cur.last, 1) === d.date) {
        cur.last = d.date;
        cur.value = Math.max(cur.value, v);
      } else {
        if (cur) out.push(cur);
        cur = { first: d.date, last: d.date, value: v };
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** [validFrom, validTo) instants covering inclusive civil dates first..last. */
export function windowInstants(first: string, last: string): { validFrom: Date; validTo: Date } {
  return { validFrom: lagosMidnightUtc(first), validTo: lagosMidnightUtc(addDaysIso(last, 1)) };
}

/**
 * Evaluate all enabled rules for every LGA. `today` is the Lagos civil date
 * the forecast window starts on.
 */
export function evaluateAlerts(input: {
  today: string;
  rules: readonly AlertRuleLite[];
  lgas: readonly LgaLite[];
  cells: ReadonlyMap<number, CellInputs>;
}): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const horizonEnd = addDaysIso(input.today, ALERT_FORECAST_DAYS - 1);
  const rules = input.rules.filter((r) => r.enabled);

  for (const lga of input.lgas) {
    if (lga.gridCellId == null) continue;
    const cell = input.cells.get(lga.gridCellId);
    if (!cell) continue;
    const forecast = cell.forecast
      .filter((d) => d.date >= input.today && d.date <= horizonEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const rule of rules) {
      if (rule.type === "dry_spell") {
        if (!inSeason(dayOfYear(input.today), cell.season)) continue;
        const spell = composedDrySpell(cell.observed, forecast);
        if (spell.total < rule.threshold) continue;
        const first = input.today;
        const last = spell.forecastDays > 0 ? addDaysIso(input.today, spell.forecastDays - 1) : input.today;
        out.push(
          candidate(lga, rule, first, last, spell.total),
        );
        continue;
      }
      for (const w of triggerWindows(rule.type, forecast, rule.threshold)) {
        out.push(candidate(lga, rule, w.first, w.last, w.value));
      }
    }
  }
  return out;
}

function candidate(lga: LgaLite, rule: AlertRuleLite, first: string, last: string, value: number): AlertCandidate {
  const { validFrom, validTo } = windowInstants(first, last);
  return {
    lgaId: lga.id,
    ruleId: rule.id,
    type: rule.type,
    severity: rule.severity,
    firstDate: first,
    lastDate: last,
    validFrom,
    validTo,
    value,
    text: renderTemplate(rule.template, {
      lga: lga.name,
      value,
      threshold: rule.threshold,
      date: formatDateWindow(first, last),
    }),
  };
}

export type ExistingAlert = { lgaId: number; type: AlertType; validFrom: Date; validTo: Date };

export function overlaps(a: { validFrom: Date; validTo: Date }, b: { validFrom: Date; validTo: Date }): boolean {
  return a.validFrom.getTime() < b.validTo.getTime() && b.validFrom.getTime() < a.validTo.getTime();
}

/** Drop candidates that overlap an existing alert of the same LGA + type (idempotent re-runs). */
export function dedupeAgainstExisting(
  candidates: readonly AlertCandidate[],
  existing: readonly ExistingAlert[],
): AlertCandidate[] {
  const kept: AlertCandidate[] = [];
  for (const c of candidates) {
    const clash =
      existing.some((e) => e.lgaId === c.lgaId && e.type === c.type && overlaps(e, c)) ||
      kept.some((k) => k.lgaId === c.lgaId && k.type === c.type && overlaps(k, c));
    if (!clash) kept.push(c);
  }
  return kept;
}
