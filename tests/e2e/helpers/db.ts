import "dotenv/config";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

/**
 * Direct DB access for e2e setup assertions and teardown. Uses the same
 * DATABASE_URL as the dev server (the seeded dev DB). Every spec that writes
 * rows cleans them up in afterAll via teardownUser().
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return pool;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** Remove a local-storage file written by the report engine (best effort). */
async function removeStoredFile(key: string | null): Promise<void> {
  if (!key || (process.env.STORAGE_DRIVER ?? "local") !== "local") return;
  const dir = process.env.STORAGE_LOCAL_DIR ?? "./storage";
  await unlink(path.resolve(dir, key)).catch(() => undefined);
}

/**
 * Delete an e2e-created user and every organisation they own, plus the rows
 * those own. Most app tables have no FK cascade to users/orgs, so order
 * matters: api_usage → api_keys/reports → custom_areas/subscriptions →
 * user-scoped rows → organizations (cascades members/invitations) → users
 * (cascades sessions/accounts/members).
 */
export async function teardownUser(email: string): Promise<void> {
  const users = await q<{ id: string }>("select id from users where email = $1", [email]);
  if (users.length === 0) return;
  const userId = users[0].id;
  const orgs = await q<{ organization_id: string }>(
    "select organization_id from members where user_id = $1 and role = 'owner'",
    [userId],
  );
  for (const { organization_id: orgId } of orgs) {
    // never touch an org that has other members (e.g. a seeded one)
    const others = await q("select 1 from members where organization_id = $1 and user_id <> $2", [orgId, userId]);
    if (others.length > 0) continue;
    await q("delete from api_usage where api_key_id in (select id from api_keys where organization_id = $1)", [orgId]);
    await q("delete from api_keys where organization_id = $1", [orgId]);
    const reps = await q<{ pdf_key: string | null }>("select pdf_key from reports where organization_id = $1", [orgId]);
    for (const r of reps) await removeStoredFile(r.pdf_key);
    await q("delete from reports where organization_id = $1", [orgId]);
    await q("delete from custom_areas where organization_id = $1", [orgId]);
    await q("delete from subscriptions where organization_id = $1", [orgId]);
    await q("delete from organizations where id = $1", [orgId]);
  }
  await q("delete from daily_send_subscriptions where user_id = $1", [userId]);
  await q("delete from report_subscriptions where user_id = $1", [userId]);
  await q("delete from notifications where user_id = $1", [userId]);
  await q("delete from saved_places where user_id = $1", [userId]);
  await q("delete from subscriptions where user_id = $1", [userId]);
  await q("delete from audit_log where actor_user_id = $1", [userId]);
  await q("delete from users where id = $1", [userId]);
}
