import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  burstLimitPerMinute,
  decideQuota,
  secondsUntilLagosMidnight,
  shouldTouchKey,
  touchKeySql,
  usageIncrementSql,
} from "@/lib/api/usage";

const dialect = new PgDialect();

describe("usageIncrementSql", () => {
  it("is a single atomic upsert-increment returning the day total", () => {
    const q = dialect.sqlToQuery(usageIncrementSql("key-1", "2026-10-08", "forecast"));
    const text = q.sql.replace(/\s+/g, " ");
    expect(text).toContain("insert into api_usage (api_key_id, day, endpoint, count)");
    expect(text).toContain("on conflict (api_key_id, day, endpoint) do update set count = api_usage.count + 1");
    expect(text).toContain("returning count");
    // other endpoints for the same key/day are summed, this endpoint comes from the CTE
    expect(text).toContain("endpoint <> $");
    expect(text).toContain("as day_total");
    expect(q.params).toEqual(["key-1", "2026-10-08", "forecast", "key-1", "2026-10-08", "forecast"]);
  });
  it("never interpolates values into the SQL text", () => {
    const q = dialect.sqlToQuery(usageIncrementSql("x'; drop table api_keys; --", "2026-10-08", "forecast"));
    expect(q.sql).not.toContain("drop table");
  });
});

describe("touchKeySql", () => {
  it("only stamps keys whose last_used_at is null or > 1 minute old", () => {
    const q = dialect.sqlToQuery(touchKeySql("k"));
    expect(q.sql.replace(/\s+/g, " ")).toContain("last_used_at is null or last_used_at < now() - interval '1 minute'");
    expect(q.params).toEqual(["k"]);
  });
  it("shouldTouchKey throttles in-process too", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    expect(shouldTouchKey(null, now)).toBe(true);
    expect(shouldTouchKey(new Date("2026-10-08T09:59:30Z"), now)).toBe(false);
    expect(shouldTouchKey(new Date("2026-10-08T09:58:59Z"), now)).toBe(true);
  });
});

describe("daily quota (429 path)", () => {
  const noon = new Date("2026-10-08T11:00:00Z"); // 12:00 Lagos
  it("allows up to and including the limit", () => {
    expect(decideQuota(1, 100, noon)).toEqual({ ok: true, remaining: 99 });
    expect(decideQuota(100, 100, noon)).toEqual({ ok: true, remaining: 0 });
  });
  it("rejects the call that crosses the limit with Retry-After = seconds to Lagos midnight", () => {
    const d = decideQuota(101, 100, noon);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.retryAfterSeconds).toBe(12 * 3600);
  });
  it("a zero-call plan rejects immediately", () => {
    expect(decideQuota(1, 0, noon).ok).toBe(false);
  });
  it("Lagos midnight is 23:00 UTC", () => {
    expect(secondsUntilLagosMidnight(new Date("2026-10-08T22:59:00Z"))).toBe(60);
    expect(secondsUntilLagosMidnight(new Date("2026-10-08T23:00:00Z"))).toBe(86_400);
  });
});

describe("burst limit", () => {
  it("is ~1% of the daily allowance clamped to [30, 600]", () => {
    expect(burstLimitPerMinute(100)).toBe(30);
    expect(burstLimitPerMinute(10_000)).toBe(100);
    expect(burstLimitPerMinute(100_000)).toBe(600);
  });
});
