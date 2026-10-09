import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { lagosToday } from "@/lib/time";
import { maybeCleanup, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { hashApiKey, parseBearer } from "./keys";
import { getOrgPlan, type ResolvedPlan } from "./limits";
import { apiError, ApiHttpError } from "./respond";
import { burstLimitPerMinute, decideQuota, shouldTouchKey, touchKeySql, usageIncrementSql } from "./usage";

/**
 * Public API v1 request guard — authz for every /api/v1 route handler
 * (CONVENTIONS rules 6–8):
 *
 *   Authorization: Bearer wd_live_…  → sha256 → api_keys (not revoked) →
 *     org plan → per-minute burst guard (in-memory) → per-day quota via the
 *     atomic api_usage upsert-increment (429 + Retry-After when over) →
 *     throttled last_used_at.
 *   No header → anonymous preview, RATE_LIMITS.publicApiAnon per IP, with
 *     an X-WeatherDesk-Notice header.
 *   Malformed / unknown / revoked key → 401 (never silently anonymous).
 */

export type ApiPrincipal =
  | { kind: "anon"; ip: string }
  | { kind: "key"; keyId: string; organizationId: string; plan: ResolvedPlan };

export type ApiHandlerResult = { body: unknown; status?: number };

/** Header values must be ByteStrings (latin-1) — keep this ASCII (no em dashes). */
const ANON_NOTICE = "unauthenticated preview - get a key at /org (API keys) and send Authorization: Bearer <key>";

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

function resetSeconds(resetAt: number): string {
  return String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
}

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers":
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Quota-Limit, X-Quota-Remaining, Retry-After, X-WeatherDesk-Notice",
};

export async function withApi(
  request: Request,
  endpoint: string,
  handler: (principal: ApiPrincipal) => Promise<ApiHandlerResult>,
): Promise<Response> {
  maybeCleanup();
  const headers: Record<string, string> = { ...BASE_HEADERS };
  const bearer = parseBearer(request.headers.get("authorization"));
  let principal: ApiPrincipal;

  if (bearer.kind === "invalid") {
    return apiError("unauthorized", "Malformed Authorization header. Use: Authorization: Bearer wd_live_…", BASE_HEADERS);
  }

  if (bearer.kind === "none") {
    const ip = clientIp(request);
    const { limit, windowMs } = RATE_LIMITS.publicApiAnon;
    const rl = rateLimit(`public:${ip}:api-v1`, limit, windowMs);
    headers["X-WeatherDesk-Notice"] = ANON_NOTICE;
    headers["X-RateLimit-Limit"] = String(limit);
    headers["X-RateLimit-Remaining"] = String(rl.remaining);
    headers["X-RateLimit-Reset"] = resetSeconds(rl.resetAt);
    if (!rl.ok) {
      return apiError("rate_limited", `Anonymous limit of ${limit} requests/minute exceeded. Use an API key for higher limits.`, {
        ...headers,
        "Retry-After": resetSeconds(rl.resetAt),
      });
    }
    principal = { kind: "anon", ip };
  } else {
    const [key] = await db
      .select({ id: apiKeys.id, organizationId: apiKeys.organizationId, lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hashApiKey(bearer.token)), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (!key) return apiError("unauthorized", "Unknown or revoked API key.", BASE_HEADERS);

    const plan = await getOrgPlan(key.organizationId);
    const perDay = plan.limits.apiCallsPerDay;
    if (perDay <= 0) return apiError("forbidden", "Your plan does not include API access.", BASE_HEADERS);

    const burst = burstLimitPerMinute(perDay);
    const rl = rateLimit(`api:${key.id}`, burst, 60_000);
    headers["X-RateLimit-Limit"] = String(burst);
    headers["X-RateLimit-Remaining"] = String(rl.remaining);
    headers["X-RateLimit-Reset"] = resetSeconds(rl.resetAt);
    if (!rl.ok) {
      return apiError("rate_limited", `Burst limit of ${burst} requests/minute exceeded.`, {
        ...headers,
        "Retry-After": resetSeconds(rl.resetAt),
      });
    }

    const res = await db.execute<{ endpoint_count: number; day_total: number }>(
      usageIncrementSql(key.id, lagosToday(), endpoint),
    );
    const dayTotal = Number(res.rows[0]?.day_total ?? 0);
    const quota = decideQuota(dayTotal, perDay);
    headers["X-Quota-Limit"] = String(perDay);
    headers["X-Quota-Remaining"] = String(quota.remaining);
    if (!quota.ok) {
      return apiError("quota_exceeded", `Daily quota of ${perDay} calls reached (plan: ${plan.name}). Resets at midnight Africa/Lagos.`, {
        ...headers,
        "Retry-After": String(quota.retryAfterSeconds),
      });
    }

    if (shouldTouchKey(key.lastUsedAt)) {
      // throttled in SQL too; failures must never break the request
      db.execute(touchKeySql(key.id)).catch(() => {});
    }
    principal = { kind: "key", keyId: key.id, organizationId: key.organizationId, plan };
  }

  try {
    const out = await handler(principal);
    return Response.json(out.body, { status: out.status ?? 200, headers });
  } catch (e) {
    if (e instanceof ApiHttpError) return apiError(e.code, e.message, headers);
    console.error(`[api-v1] ${endpoint} failed`, e);
    return apiError("internal", "Internal error", headers);
  }
}

/** CORS preflight shared by the v1 routes. */
export function apiOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...BASE_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
