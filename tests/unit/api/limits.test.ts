import { describe, expect, it } from "vitest";
import {
  assertWithinLimit,
  checkLimit,
  FREE_LIMITS,
  LimitError,
  parsePlanLimits,
  resolvePlan,
} from "@/lib/api/limits";

// mirrors the seeded plans table
const PLANS = [
  { id: "free", name: "Free", kind: "org", priceKoboMonthly: 0, limits: { downloads: false, customAreas: 1, teamMembers: 1, apiCallsPerDay: 100, brandedReports: false } },
  { id: "org_basic", name: "Organisation Basic", kind: "org", priceKoboMonthly: 5_000_000, limits: { downloads: true, customAreas: 5, teamMembers: 5, apiCallsPerDay: 10_000, brandedReports: true } },
  { id: "org_pro", name: "Organisation Pro", kind: "org", priceKoboMonthly: 20_000_000, limits: { downloads: true, customAreas: 25, teamMembers: 25, apiCallsPerDay: 100_000, brandedReports: true } },
  { id: "sms_daily", name: "Daily SMS forecast", kind: "personal_addon", priceKoboMonthly: 100_000, limits: { dailySends: 1, apiCallsPerDay: 0 } },
];
const NOW = new Date("2026-10-08T12:00:00Z");
const sub = (planId: string, status = "active", end: Date | null = null, id = planId) => ({
  id,
  planId,
  status,
  currentPeriodEnd: end,
  createdAt: new Date("2026-09-01T00:00:00Z"),
});

describe("parsePlanLimits", () => {
  it("parses a full limits object", () => {
    expect(parsePlanLimits(PLANS[1]!.limits)).toEqual({
      apiCallsPerDay: 10_000,
      customAreas: 5,
      teamMembers: 5,
      downloads: true,
      brandedReports: true,
      dailySends: 0,
    });
  });
  it("falls back field-by-field on junk", () => {
    const l = parsePlanLimits({ apiCallsPerDay: -5, customAreas: "3", downloads: "yes" });
    expect(l).toEqual(FREE_LIMITS);
    expect(parsePlanLimits(null)).toEqual(FREE_LIMITS);
    expect(parsePlanLimits({ customAreas: 2.9 }).customAreas).toBe(2);
  });
});

describe("resolvePlan", () => {
  it("no subscription → free", () => {
    const p = resolvePlan([], PLANS, NOW);
    expect(p.id).toBe("free");
    expect(p.limits.apiCallsPerDay).toBe(100);
    expect(p.subscriptionId).toBeNull();
  });
  it("active subscription → its plan", () => {
    const p = resolvePlan([sub("org_basic")], PLANS, NOW);
    expect(p.id).toBe("org_basic");
    expect(p.limits.customAreas).toBe(5);
    expect(p.subscriptionId).toBe("org_basic");
  });
  it("ignores pending/canceled and expired rows", () => {
    expect(resolvePlan([sub("org_pro", "pending")], PLANS, NOW).id).toBe("free");
    expect(resolvePlan([sub("org_pro", "canceled")], PLANS, NOW).id).toBe("free");
    expect(resolvePlan([sub("org_pro", "active", new Date("2026-10-01T00:00:00Z"))], PLANS, NOW).id).toBe("free");
  });
  it("past_due still grants (grace) and the most expensive overlapping plan wins", () => {
    expect(resolvePlan([sub("org_basic", "past_due")], PLANS, NOW).id).toBe("org_basic");
    expect(resolvePlan([sub("org_basic"), sub("org_pro")], PLANS, NOW).id).toBe("org_pro");
  });
  it("personal add-ons never become an org plan", () => {
    expect(resolvePlan([sub("sms_daily")], PLANS, NOW).id).toBe("free");
  });
});

describe("checkLimit / assertWithinLimit", () => {
  const basic = parsePlanLimits(PLANS[1]!.limits);
  const free = parsePlanLimits(PLANS[0]!.limits);
  it("numeric limits compare the count before the new item", () => {
    expect(checkLimit("customAreas", basic, 4)).toEqual({ ok: true, limit: 5, used: 4, remaining: 1 });
    expect(checkLimit("customAreas", basic, 5).ok).toBe(false);
    expect(checkLimit("customAreas", free, 0).ok).toBe(true);
    expect(checkLimit("customAreas", free, 1).ok).toBe(false);
  });
  it("boolean limits gate features", () => {
    expect(checkLimit("downloads", basic).ok).toBe(true);
    expect(checkLimit("downloads", free).ok).toBe(false);
  });
  it("assert throws a LimitError with a readable message", () => {
    expect(() => assertWithinLimit("customAreas", free, 1)).toThrow(LimitError);
    expect(() => assertWithinLimit("customAreas", free, 1)).toThrow(/1 of 1 custom areas/);
    expect(() => assertWithinLimit("downloads", free)).toThrow(/does not include data downloads/);
    expect(assertWithinLimit("teamMembers", basic, 2).remaining).toBe(3);
  });
});
