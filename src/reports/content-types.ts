/**
 * reports.content JSON contract (version 1) — binding for the reports engine
 * (A5, producer) and the public report pages (A4, consumer). TYPES ONLY.
 */

export type ReportSvg = { key: string; title: string; svg: string };

export type ReportStats = {
  rainTotalMm: number | null;
  rainPctOfNormal: number | null;
  meanTmaxC: number | null;
  tmaxAnomalyC: number | null;
  rainyDays: number | null;
};

export type ReportExtremes = {
  wettest: { name: string; valueMm: number }[];
  driest: { name: string; valueMm: number }[];
  hottest: { name: string; valueC: number }[];
};

export type ReportTableRow = {
  name: string;
  slug?: string;
  rainMm: number | null;
  rainPctOfNormal: number | null;
  band: string | null;
  meanTmaxC: number | null;
  tmaxAnomalyC: number | null;
};

export type ReportTable = { rows: ReportTableRow[]; unitNote: string };

export type ReportAlertCount = { type: string; count: number };

export type ReportOutlookDay = { date: string; rainMm: number | null; tmaxC: number | null };

export type ReportOutlook = { text: string; days: ReportOutlookDay[] };

export type ReportSeasonProgress = { zone: string; status: string };

export type ReportAccuracy = {
  text: string;
  maeTmax: number | null;
  rainHitRatePct: number | null;
};

export type ReportContent = {
  version: 1;
  /** one template sentence */
  headline: string;
  /** "6–12 October 2026" / "September 2026" */
  periodLabel: string;
  /** "Nigeria" | state name | custom area name */
  scopeLabel: string;
  /** inline-safe SVG strings */
  svgs: ReportSvg[];
  stats: ReportStats;
  extremes: ReportExtremes;
  /** by state (national) or by LGA (state/area) */
  table: ReportTable;
  alertsIssued: ReportAlertCount[];
  /** weekly only */
  outlook?: ReportOutlook;
  /** monthly only */
  seasonProgress?: ReportSeasonProgress[];
  /** monthly only */
  comingMonth?: { text: string };
  /** monthly only */
  accuracy?: ReportAccuracy;
  methodsNote: string;
  /** attribution lines (includes the NiMet disclaimer line) */
  sources: string[];
  /**
   * Engine bookkeeping (optional for consumers): the template narrative the
   * engine last generated. `reports.narrative` is only overwritten on
   * regeneration while it still equals this value (editor edits survive).
   */
  generatedNarrative?: string;
};
