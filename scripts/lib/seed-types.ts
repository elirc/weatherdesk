import type { Pool } from "pg";
import type { Db } from "@/db";

/**
 * Seed step contract. Every file in scripts/seed-steps/ named
 * `NN-name.ts` (NN = two-digit order) exports ONE of:
 *
 *   export const step: SeedStep = { name: "reports", run: async (ctx) => ({ reports: 5 }) };
 *   export default { name, run } satisfies SeedStep;
 *   export default async function (ctx: SeedContext) { ...; return { rows: 1 }; }
 *
 * `run` must be idempotent (upsert or skip-if-present) and return a map of
 * row counts to log. The runner (scripts/seed.ts) times each step.
 */
export type SeedContext = {
  db: Db;
  /** raw pg pool — for PostGIS / bulk (unnest) statements only */
  pool: Pool;
  mode: "mock" | "real";
  /** repo root (absolute) */
  root: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
};

export type SeedCounts = Record<string, number | string>;

export type SeedStep = {
  name: string;
  run: (ctx: SeedContext) => Promise<SeedCounts | void>;
};
