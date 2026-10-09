import { classifyNormalBand } from "@/lib/weather/calc";
import { NORMALS_END_YEAR, NORMALS_START_YEAR, RAINY_DAY_MM } from "@/lib/weather/constants";
import type { ReportContent, ReportExtremes, ReportOutlookDay } from "./content-types";

/**
 * Fixed narrative templates (no AI text — numbers cannot be misstated).
 * PURE: data in → string out. Every sentence handles null as
 * "data unavailable" and picks singular/plural from the number.
 *
 * Text sticks to characters in the PDF standard-font (WinAnsi) set:
 * °, –, ± are fine; avoid ≥ and the Unicode minus.
 */

export const NORMALS_LABEL = `${NORMALS_START_YEAR}–${NORMALS_END_YEAR}`;

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
];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

function parts(date: string): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

/** "6–12 October 2026", "29 September – 5 October 2026", "29 December 2025 – 4 January 2026", "September 2026". */
export function formatPeriodLabel(type: "weekly" | "monthly", start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (type === "monthly") return `${monthName(a.m)} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${monthName(a.m)} ${a.y} – ${b.d} ${monthName(b.m)} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${monthName(a.m)} – ${b.d} ${monthName(b.m)} ${b.y}`;
  return `${a.d}–${b.d} ${monthName(a.m)} ${a.y}`;
}

/** "Tuesday 7 October" */
export function formatDayLabel(date: string): string {
  const p = parts(date);
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
  return `${wd} ${p.d} ${monthName(p.m)}`;
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** "3 rainy days" / "1 rainy day" / "2.5 rainy days" */
export function countWith(n: number, singular: string, pluralForm?: string): string {
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${shown} ${plural(n, singular, pluralForm)}`;
}

export function fmtMm(v: number): string {
  return `${v.toFixed(1)} mm`;
}

export function fmtC(v: number): string {
  return `${v.toFixed(1)} °C`;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Anomaly phrase: "0.8 °C warmer than normal" | "close to normal" | null. Within ±0.5 °C counts as close. */
export function anomalyPhrase(anomalyC: number | null): string | null {
  if (anomalyC == null) return null;
  const a = Math.round(anomalyC * 10) / 10;
  if (Math.abs(a) < 0.5) return "close to normal";
  return `${Math.abs(a).toFixed(1)} °C ${a > 0 ? "warmer" : "cooler"} than normal`;
}

/** "Rainfall was above normal at 134% of the 1991–2020 average, with an area-average total of 45.2 mm." */
export function rainSentence(rainMm: number | null, pct: number | null): string {
  const band = classifyNormalBand(pct);
  if (rainMm == null) return "Rainfall: data unavailable for this period.";
  if (band == null || pct == null) {
    return `Rainfall averaged ${fmtMm(rainMm)} across the area; comparison with the ${NORMALS_LABEL} average: data unavailable.`;
  }
  return `Rainfall was ${band} at ${pct}% of the ${NORMALS_LABEL} average, with an area-average total of ${fmtMm(rainMm)}.`;
}

/** "Daytime highs averaged 31.4 °C, 0.8 °C warmer than normal." */
export function temperatureSentence(meanTmaxC: number | null, anomalyC: number | null): string {
  if (meanTmaxC == null) return "Daytime temperatures: data unavailable for this period.";
  const phrase = anomalyPhrase(anomalyC);
  if (phrase == null) return `Daytime highs averaged ${fmtC(meanTmaxC)}; comparison with normal: data unavailable.`;
  return `Daytime highs averaged ${fmtC(meanTmaxC)}, ${phrase}.`;
}

/** "Locations recorded an average of 3.4 rainy days (1 mm or more)." */
export function rainyDaysSentence(rainyDays: number | null): string {
  if (rainyDays == null) return "Rainy days: data unavailable.";
  return `Locations recorded an average of ${countWith(rainyDays, "rainy day")} (${RAINY_DAY_MM.toFixed(0)} mm or more).`;
}

export function extremesSentence(ex: ReportExtremes): string {
  const out: string[] = [];
  const wet = ex.wettest[0];
  const dry = ex.driest[0];
  const hot = ex.hottest[0];
  if (wet && dry) {
    out.push(`The wettest location was ${wet.name} with ${fmtMm(wet.valueMm)}; the driest was ${dry.name} with ${fmtMm(dry.valueMm)}.`);
  } else if (wet) {
    out.push(`The wettest location was ${wet.name} with ${fmtMm(wet.valueMm)}.`);
  }
  if (hot) out.push(`The highest daytime temperature, ${fmtC(hot.valueC)}, was recorded in ${hot.name}.`);
  if (!out.length) return "Extremes: data unavailable.";
  return out.join(" ");
}

export const ALERT_TYPE_LABELS: Record<string, string> = {
  heavy_rain: "heavy rain",
  heat: "extreme heat",
  wind: "strong wind",
  dry_spell: "dry spell",
};

/** "WeatherDesk issued 17 advisories: 16 dry spell advisories and 1 extreme heat advisory." */
export function alertsSentence(alerts: { type: string; count: number }[]): string {
  const nonZero = alerts.filter((a) => a.count > 0);
  const total = nonZero.reduce((s, a) => s + a.count, 0);
  if (total === 0) return "No WeatherDesk advisories were issued during the period.";
  const items = nonZero.map(
    (a) => `${a.count} ${ALERT_TYPE_LABELS[a.type] ?? a.type.replaceAll("_", " ")} ${plural(a.count, "advisory", "advisories")}`,
  );
  return `WeatherDesk issued ${countWith(total, "advisory", "advisories")} during the period: ${joinList(items)}. Advisories are not official warnings.`;
}

export function headline(input: {
  type: "weekly" | "monthly";
  scopeLabel: string;
  periodLabel: string;
  rainPctOfNormal: number | null;
  tmaxAnomalyC: number | null;
}): string {
  const band = classifyNormalBand(input.rainPctOfNormal);
  const rain =
    band == null
      ? "Rainfall comparison unavailable"
      : `Rainfall ${band} (${input.rainPctOfNormal}% of average)`;
  const phrase = anomalyPhrase(input.tmaxAnomalyC);
  const temp = phrase == null ? "" : `, with daytime highs ${phrase}`;
  return `${rain} across ${input.scopeLabel} for ${input.periodLabel}${temp}.`;
}

/** Weekly outlook from the aggregated next-7-days forecast. */
export function outlookText(scopeLabel: string, days: ReportOutlookDay[]): string {
  const withRain = days.filter((d) => d.rainMm != null);
  const withT = days.filter((d) => d.tmaxC != null);
  if (!withRain.length && !withT.length) return "Outlook: forecast data unavailable for the coming days.";
  const n = days.length;
  const out: string[] = [];
  if (withRain.length) {
    const total = withRain.reduce((s, d) => s + (d.rainMm ?? 0), 0);
    out.push(
      `Over the next ${countWith(n, "day")}, forecasts point to an area-average of ${fmtMm(total)} of rain across ${scopeLabel}.`,
    );
    const wettest = withRain.reduce((a, b) => ((b.rainMm ?? 0) > (a.rainMm ?? 0) ? b : a));
    if ((wettest.rainMm ?? 0) >= RAINY_DAY_MM) {
      out.push(`The wettest day looks to be ${formatDayLabel(wettest.date)} (${fmtMm(wettest.rainMm ?? 0)}).`);
    } else {
      out.push("Little or no rain is expected on any day.");
    }
  }
  if (withT.length) {
    const meanT = withT.reduce((s, d) => s + (d.tmaxC ?? 0), 0) / withT.length;
    out.push(`Daytime highs should average about ${fmtC(meanT)}.`);
  }
  out.push("Forecast confidence falls with lead time.");
  return out.join(" ");
}

/**
 * Season-progress status for one zone: share of locations where the
 * rainy-season onset has occurred vs the share expected by now from normals.
 */
export function seasonStatus(onsetPct: number | null, normalPct: number | null): string {
  if (onsetPct == null) return "Onset data unavailable.";
  const base = `Onset has occurred in ${onsetPct}% of locations`;
  if (normalPct == null) return `${base}.`;
  const diff = onsetPct - normalPct;
  const verdict =
    Math.abs(diff) <= 10 ? "in line with normal" : diff > 0 ? "ahead of normal" : "behind normal";
  return `${base} (normally ${normalPct}% by now) — ${verdict}.`;
}

export function seasonSentence(rows: { zone: string; status: string }[]): string {
  if (!rows.length) return "Season progress: data unavailable.";
  return `Rainy-season progress by zone — ${rows.map((r) => `${r.zone}: ${r.status}`).join(" ")}`;
}

/** "October normally brings about 120.4 mm of rain across Nigeria (1991–2020 average), with daytime highs near 31.2 °C." */
export function comingMonthText(month: number, scopeLabel: string, rainMm: number | null, tmaxC: number | null): string {
  const name = monthName(month);
  if (rainMm == null && tmaxC == null) return `${name} normals: data unavailable.`;
  if (rainMm == null) return `${name} normally brings daytime highs near ${fmtC(tmaxC as number)} across ${scopeLabel} (${NORMALS_LABEL} average).`;
  const t = tmaxC == null ? "" : `, with daytime highs near ${fmtC(tmaxC)}`;
  return `${name} normally brings about ${fmtMm(rainMm)} of rain across ${scopeLabel} (${NORMALS_LABEL} average)${t}.`;
}

/** Accuracy of next-day forecasts for the report month. */
export function accuracyText(
  monthLabel: string,
  maeTmax: number | null,
  rainHitRatePct: number | null,
  nSamples: number | null,
): string {
  if (maeTmax == null && rainHitRatePct == null) return `Forecast accuracy for ${monthLabel}: data unavailable.`;
  const out: string[] = [];
  if (maeTmax != null) {
    out.push(`In ${monthLabel}, next-day maximum-temperature forecasts were off by ${maeTmax.toFixed(1)} °C on average`);
  }
  if (rainHitRatePct != null) {
    out.push(
      `${out.length ? "and" : `In ${monthLabel},`} ${rainHitRatePct}% of next-day rain / no-rain calls verified`,
    );
  }
  const n = nSamples != null && nSamples > 0 ? ` (${nSamples.toLocaleString("en-GB")} ${plural(nSamples, "forecast")} checked)` : "";
  return `${out.join(" ")}${n}.`;
}

/**
 * The report narrative (paragraphs separated by a blank line). Built only
 * from content numbers, so the narrative can never disagree with the tables.
 */
export function buildNarrative(c: ReportContent): string {
  const paras: string[] = [];
  paras.push(
    [
      rainSentence(c.stats.rainTotalMm, c.stats.rainPctOfNormal),
      rainyDaysSentence(c.stats.rainyDays),
      temperatureSentence(c.stats.meanTmaxC, c.stats.tmaxAnomalyC),
    ].join(" "),
  );
  paras.push(extremesSentence(c.extremes));
  paras.push(alertsSentence(c.alertsIssued));
  if (c.outlook) paras.push(c.outlook.text);
  if (c.seasonProgress) paras.push(seasonSentence(c.seasonProgress));
  if (c.comingMonth) paras.push(c.comingMonth.text);
  if (c.accuracy) paras.push(c.accuracy.text);
  return paras.join("\n\n");
}
