/**
 * Fixed-window in-memory rate limiter. Suitable for a single web process;
 * API-plan limits are additionally enforced against api_usage in the DB
 * (see src/lib/api/usage.ts, owned by the API agent).
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * `key` should combine the scope and principal, e.g. `signin:1.2.3.4`,
 * `otp:+23480...`, `api:wd_live_xxx`, `public:1.2.3.4:/api/v1/forecast`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  w.count += 1;
  if (w.count > limit) {
    return { ok: false, remaining: 0, resetAt: w.resetAt };
  }
  return { ok: true, remaining: limit - w.count, resetAt: w.resetAt };
}

/** Periodic cleanup to keep the map bounded. */
const CLEANUP_EVERY_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();
export function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  for (const [k, w] of windows) {
    if (w.resetAt <= now) windows.delete(k);
  }
}

export const RATE_LIMITS = {
  signIn: { limit: 10, windowMs: 15 * 60 * 1000 },
  otp: { limit: 5, windowMs: 15 * 60 * 1000 },
  publicApiAnon: { limit: 60, windowMs: 60 * 1000 },
  search: { limit: 30, windowMs: 60 * 1000 },
} as const;
