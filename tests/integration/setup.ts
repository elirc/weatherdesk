import "dotenv/config";
import { execSync } from "node:child_process";
import { Pool } from "pg";
import { beforeAll } from "vitest";

/**
 * Integration tests run against TEST_DATABASE_URL (weatherdesk_test), never
 * the dev database. The orchestrator runs these serially (fileParallelism is
 * off in vitest.config.ts). Build agents: WRITE these tests but do NOT run
 * them — see docs/CONVENTIONS.md gates.
 */

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5440/weatherdesk_test";

process.env.DATABASE_URL = TEST_URL;
process.env.WD_MODE = "mock";

let migrated = false;

beforeAll(async () => {
  if (!migrated) {
    execSync("pnpm drizzle-kit migrate", {
      env: { ...process.env, DATABASE_URL: TEST_URL },
      stdio: "pipe",
    });
    migrated = true;
  }
});

/** Truncate app tables between suites that need a clean slate. */
export async function truncateAll(except: string[] = []): Promise<void> {
  const pool = new Pool({ connectionString: TEST_URL, max: 1 });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'
       and tablename not in ('spatial_ref_sys', '__drizzle_migrations')`,
    );
    const tables = rows.map((r) => r.tablename).filter((t) => !except.includes(t));
    if (tables.length) {
      await pool.query(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} cascade`);
    }
  } finally {
    await pool.end();
  }
}
