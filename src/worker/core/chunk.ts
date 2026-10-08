/** Pure batching helpers. */

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1 (got ${size})`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Split an inclusive YYYY-MM-DD range into calendar-year pieces, e.g.
 * 2019-06-01..2021-02-03 → [2019-06-01..2019-12-31, 2020-01-01..2020-12-31,
 * 2021-01-01..2021-02-03]. Empty when start > end.
 */
export function yearChunks(startDate: string, endDate: string): { start: string; end: string }[] {
  if (startDate > endDate) return [];
  const out: { start: string; end: string }[] = [];
  const y0 = Number(startDate.slice(0, 4));
  const y1 = Number(endDate.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    const s = y === y0 ? startDate : `${y}-01-01`;
    const e = y === y1 ? endDate : `${y}-12-31`;
    out.push({ start: s, end: e });
  }
  return out;
}

/** Stable singleton key for a forecast chunk (avoids queue pile-up on overlapping refreshes). */
export function chunkKey(ids: readonly number[]): string {
  if (ids.length === 0) return "cells:empty";
  return `cells:${ids[0]}-${ids[ids.length - 1]}:${ids.length}`;
}
