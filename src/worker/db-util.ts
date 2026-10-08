import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * `SET col = excluded.col` for every column of `table` except `skip`
 * (property names), for onConflictDoUpdate upserts.
 */
export function excludedSet<T extends PgTable>(table: T, skip: string[]): Record<string, SQL> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  const out: Record<string, SQL> = {};
  for (const [prop, col] of Object.entries(cols)) {
    if (skip.includes(prop)) continue;
    out[prop] = sql.raw(`excluded."${col.name}"`);
  }
  return out;
}

/** Insert rows in parameter-safe slices (Postgres caps bind parameters at 65535). */
export async function inSlices<R>(rows: readonly R[], size: number, fn: (slice: R[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}
