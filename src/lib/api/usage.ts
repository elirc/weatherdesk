import { sql, type SQL } from "drizzle-orm";

/**
 * API usage accounting (pure parts). The per-day plan limit is enforced
 * against api_usage with ONE atomic statement: upsert-increment this
 * (key, day, endpoint) row and return the key's total for the day.
 * The CTE's snapshot cannot see its own insert, so the total is
 * "other endpoints today" + the freshly returned count.
 */

export function usageIncrementSql(apiKeyId: string, day: string, endpoint: string): SQL {
  return sql`
    with up as (
      insert into api_usage (api_key_id, day, endpoint, count)
      values (${apiKeyId}, ${day}::date, ${endpoint}, 1)
      on conflict (api_key_id, day, endpoint)
      do update set count = api_usage.count + 1
      returning count
    )
    select
      (select count from up)::int as endpoint_count,
      ((select count from up) + coalesce((
        select sum(count) from api_usage
        where api_key_id = ${apiKeyId} and day = ${day}::date and endpoint <> ${endpoint}
      ), 0))::int as day_total`;
}

/** Throttled last_used_at stamp: a no-op unless the stored value is > 1 minute stale. */
export function touchKeySql(apiKeyId: string): SQL {
  return sql`
    update api_keys set last_used_at = now()
    where id = ${apiKeyId}
      and (last_used_at is null or last_used_at < now() - interval '1 minute')`;
}

export const LAST_USED_THROTTLE_MS = 60_000;

export function shouldTouchKey(lastUsedAt: Date | null, now: Date = new Date()): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
}

/**
 * Per-minute in-memory burst guard for keyed requests: ~1% of the daily
 * allowance, clamped to [30, 600]. Free (100/day) → 30/min.
 */
export function burstLimitPerMinute(apiCallsPerDay: number): number {
  return Math.min(600, Math.max(30, Math.ceil(apiCallsPerDay / 100)));
}

/** Seconds until the next Africa/Lagos midnight (daily quota reset). Lagos is UTC+1, no DST. */
export function secondsUntilLagosMidnight(now: Date = new Date()): number {
  const lagosMs = now.getTime() + 3600_000;
  const dayMs = 86_400_000;
  const nextMidnightLagos = Math.floor(lagosMs / dayMs) * dayMs + dayMs;
  return Math.max(1, Math.ceil((nextMidnightLagos - lagosMs) / 1000));
}

export type QuotaDecision =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number; remaining: 0 };

/** Day-total after increment vs plan limit. A limit of 0 means the plan has no API access. */
export function decideQuota(dayTotal: number, apiCallsPerDay: number, now: Date = new Date()): QuotaDecision {
  if (dayTotal > apiCallsPerDay) {
    return { ok: false, retryAfterSeconds: secondsUntilLagosMidnight(now), remaining: 0 };
  }
  return { ok: true, remaining: Math.max(0, apiCallsPerDay - dayTotal) };
}
