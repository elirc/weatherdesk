/**
 * Accuracy aggregation (pure). accuracy_stats holds one row per
 * month × zone × lead day. Several months are combined per zone × lead day
 * as a SAMPLE-WEIGHTED mean: Σ(value × nSamples) / Σ(nSamples), where only
 * rows with a non-null value (and nSamples > 0) contribute to that metric.
 * A plain mean of monthly means would over-weight thin months.
 */

export type AccuracyRow = {
  month: string;
  zone: string;
  leadDays: number;
  maeTmax: number | null;
  maeTmin: number | null;
  rainHitRate: number | null;
  nSamples: number;
};

export type AccuracyCell = {
  zone: string;
  leadDays: number;
  maeTmax: number | null;
  maeTmin: number | null;
  /** 0..1 */
  rainHitRate: number | null;
  nSamples: number;
};

function weighted(rows: readonly AccuracyRow[], pick: (r: AccuracyRow) => number | null, dp: number) {
  let sum = 0;
  let w = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v == null || !Number.isFinite(v) || r.nSamples <= 0) continue;
    sum += v * r.nSamples;
    w += r.nSamples;
  }
  if (!w) return null;
  const f = 10 ** dp;
  return Math.round((sum / w) * f) / f;
}

export function aggregateAccuracy(rows: readonly AccuracyRow[]): AccuracyCell[] {
  const groups = new Map<string, AccuracyRow[]>();
  for (const r of rows) {
    const k = `${r.zone}|${r.leadDays}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: AccuracyCell[] = [];
  for (const g of groups.values()) {
    out.push({
      zone: g[0].zone,
      leadDays: g[0].leadDays,
      maeTmax: weighted(g, (r) => r.maeTmax, 2),
      maeTmin: weighted(g, (r) => r.maeTmin, 2),
      rainHitRate: weighted(g, (r) => r.rainHitRate, 3),
      nSamples: g.reduce((s, r) => s + Math.max(0, r.nSamples), 0),
    });
  }
  return out.sort((a, b) => a.zone.localeCompare(b.zone) || a.leadDays - b.leadDays);
}

/** Latest `n` FULL months (strictly before the current Lagos month) present in the data. */
export function latestFullMonths(available: readonly string[], currentMonthStart: string, n = 3): string[] {
  return [...new Set(available)]
    .filter((m) => m < currentMonthStart)
    .sort()
    .slice(-n);
}

/** Minimum samples per zone × lead cell before we show the number at all. */
export const MIN_SAMPLES_TO_SHOW = 30;
