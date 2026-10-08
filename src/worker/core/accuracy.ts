import { RAIN_CALL_PROB_PCT } from "@/lib/weather/constants";
import { meanAbsError, rainHitRate } from "@/lib/weather/calc";
import { monthStartOf } from "./periods";

/**
 * Forecast accuracy aggregation (pure). One input row = one forecast_archive
 * row joined to the observed_daily row for the same cell + target date.
 * Each cell counts toward every distinct zone of its LGAs plus 'national';
 * cells with no LGA count toward 'national' only.
 */

export type AccuracyPair = {
  gridCellId: number;
  targetDate: string;
  leadDays: number;
  fcTmaxC: number | null;
  fcTminC: number | null;
  fcRainProbPct: number | null;
  obsTmaxC: number | null;
  obsTminC: number | null;
  obsRainMm: number | null;
};

export type AccuracyStat = {
  month: string;
  zone: string;
  leadDays: number;
  maeTmax: number | null;
  maeTmin: number | null;
  rainHitRate: number | null;
  nSamples: number;
};

export const NATIONAL = "national";

export function zonesForCell(cellId: number, cellZones: ReadonlyMap<number, readonly string[]>): string[] {
  const z = new Set(cellZones.get(cellId) ?? []);
  z.add(NATIONAL);
  return [...z];
}

export function aggregateAccuracy(
  pairs: readonly AccuracyPair[],
  cellZones: ReadonlyMap<number, readonly string[]>,
  callThresholdPct: number = RAIN_CALL_PROB_PCT,
): AccuracyStat[] {
  const buckets = new Map<string, { month: string; zone: string; leadDays: number; rows: AccuracyPair[] }>();
  for (const p of pairs) {
    const month = monthStartOf(p.targetDate);
    for (const zone of zonesForCell(p.gridCellId, cellZones)) {
      const key = `${month}|${zone}|${p.leadDays}`;
      let b = buckets.get(key);
      if (!b) {
        b = { month, zone, leadDays: p.leadDays, rows: [] };
        buckets.set(key, b);
      }
      b.rows.push(p);
    }
  }
  const out: AccuracyStat[] = [];
  for (const b of buckets.values()) {
    const tmax = meanAbsError(b.rows.map((r) => ({ forecast: r.fcTmaxC, observed: r.obsTmaxC })));
    const tmin = meanAbsError(b.rows.map((r) => ({ forecast: r.fcTminC, observed: r.obsTminC })));
    const rain = rainHitRate(
      b.rows.map((r) => ({ rainProbPct: r.fcRainProbPct, observedRainMm: r.obsRainMm })),
      callThresholdPct,
    );
    out.push({
      month: b.month,
      zone: b.zone,
      leadDays: b.leadDays,
      maeTmax: tmax.mae,
      maeTmin: tmin.mae,
      rainHitRate: rain.hitRate,
      nSamples: b.rows.length,
    });
  }
  return out.sort(
    (a, b) => a.month.localeCompare(b.month) || a.zone.localeCompare(b.zone) || a.leadDays - b.leadDays,
  );
}

/** Months whose aggregates must be recomputed: yesterday's plus any newly finalised dates'. */
export function affectedMonths(yesterday: string, finalisedDates: Iterable<string>): string[] {
  const s = new Set<string>([monthStartOf(yesterday)]);
  for (const d of finalisedDates) s.add(monthStartOf(d));
  return [...s].sort();
}
