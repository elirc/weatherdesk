import { describe, expect, it } from "vitest";
import {
  RUN_NOW,
  THRESHOLD_RANGES,
  alertRuleUpdateSchema,
  budgetPercent,
  checkRoleChange,
  durationLabel,
  expiryToLagosDateInput,
  isSourceUnhealthy,
  lagosDateInputToExpiry,
  mergePlanLimits,
  noticeScopeSchema,
  pivotUsage,
  regeneratePayload,
  renderTemplatePreview,
  retryPlanFor,
  statusOnPublish,
  unknownPlaceholders,
  validateThreshold,
} from "@/app/staff/_lib/policy";

describe("validateThreshold", () => {
  it.each([
    ["heavy_rain", 10, true],
    ["heavy_rain", 200, true],
    ["heavy_rain", 9.9, false],
    ["heavy_rain", 201, false],
    ["heat", 35, true],
    ["heat", 50, true],
    ["heat", 34.5, false],
    ["heat", 51, false],
    ["wind", 30, true],
    ["wind", 150, true],
    ["wind", 29, false],
    ["wind", 151, false],
    ["dry_spell", 5, true],
    ["dry_spell", 30, true],
    ["dry_spell", 4, false],
    ["dry_spell", 31, false],
  ] as const)("%s %d → %s", (type, value, ok) => {
    expect(validateThreshold(type, value).ok).toBe(ok);
  });

  it("rejects NaN and fractional dry-spell days", () => {
    expect(validateThreshold("heat", Number.NaN).ok).toBe(false);
    const r = validateThreshold("dry_spell", 10.5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/whole number/);
  });

  it("error names the range and unit", () => {
    const r = validateThreshold("wind", 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("30 and 150 km/h");
  });

  it("covers exactly the four seeded rule types", () => {
    expect(Object.keys(THRESHOLD_RANGES).sort()).toEqual(["dry_spell", "heat", "heavy_rain", "wind"]);
  });
});

describe("alertRuleUpdateSchema", () => {
  const base = { id: "r1", type: "heat", threshold: 40, severity: "moderate", enabled: true, template: "Very hot in {lga} on {date}: {value}°C (≥ {threshold})" };
  it("accepts a valid rule and coerces threshold strings", () => {
    const r = alertRuleUpdateSchema.safeParse({ ...base, threshold: "42" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.threshold).toBe(42);
  });
  it("rejects out-of-range threshold with the range message", () => {
    const r = alertRuleUpdateSchema.safeParse({ ...base, threshold: 60 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("between 35 and 50");
  });
  it("rejects unknown placeholders", () => {
    const r = alertRuleUpdateSchema.safeParse({ ...base, template: "Hot in {state} at {lga}" });
    expect(r.success).toBe(false);
  });
});

describe("template preview", () => {
  it("fills known placeholders and leaves others", () => {
    expect(renderTemplatePreview("{lga}: {value} ≥ {threshold} on {date} {x}", { lga: "Ikeja", value: "72", threshold: "50", date: "Thu" })).toBe(
      "Ikeja: 72 ≥ 50 on Thu {x}",
    );
  });
  it("lists unknown placeholders once", () => {
    expect(unknownPlaceholders("{lga} {foo} {foo} {date} {bar}")).toEqual(["{foo}", "{bar}"]);
  });
});

describe("checkRoleChange (self-demotion guard)", () => {
  it("blocks changing your own role", () => {
    const r = checkRoleChange({ actorId: "a", targetId: "a", currentRole: "admin", newRole: "user" });
    expect(r).toEqual({ ok: false, error: "You cannot change your own role" });
  });
  it("blocks self-promotion too (any self change)", () => {
    expect(checkRoleChange({ actorId: "a", targetId: "a", currentRole: "admin", newRole: "editor" }).ok).toBe(false);
  });
  it("allows changing someone else", () => {
    expect(checkRoleChange({ actorId: "a", targetId: "b", currentRole: "user", newRole: "editor" })).toEqual({ ok: true });
    expect(checkRoleChange({ actorId: "a", targetId: "b", currentRole: "admin", newRole: "user" })).toEqual({ ok: true });
  });
  it("rejects a no-op change", () => {
    expect(checkRoleChange({ actorId: "a", targetId: "b", currentRole: "editor", newRole: "editor" }).ok).toBe(false);
  });
});

describe("retryPlanFor (job retry payload mapping)", () => {
  it("replays a stored report.generate payload", () => {
    const data = { type: "weekly", scopeKey: "national", periodStart: "2026-09-28" };
    expect(retryPlanFor({ name: "report.generate", details: { jobId: "j1", data } })).toEqual({ ok: true, name: "report.generate", data });
  });
  it("replays forecast.refresh with an empty payload", () => {
    expect(retryPlanFor({ name: "forecast.refresh", details: { jobId: "j", data: {} } })).toEqual({ ok: true, name: "forecast.refresh", data: {} });
  });
  it("replays reports.monthly with phase and fetch-chunk ids", () => {
    expect(retryPlanFor({ name: "reports.monthly", details: { data: { phase: "final" } } }).ok).toBe(true);
    expect(retryPlanFor({ name: "forecast.fetch-chunk", details: { data: { gridCellIds: [1, 2] } } }).ok).toBe(true);
  });
  it("refuses runs without stored details", () => {
    expect(retryPlanFor({ name: "daily.pipeline", details: null })).toEqual({ ok: false, reason: "No stored payload for this run" });
    expect(retryPlanFor({ name: "daily.pipeline", details: { jobId: "x" } }).ok).toBe(false);
  });
  it("refuses payloads that break the contract", () => {
    expect(retryPlanFor({ name: "report.render-pdf", details: { data: {} } }).ok).toBe(false);
    expect(retryPlanFor({ name: "reports.monthly", details: { data: { phase: "bogus" } } }).ok).toBe(false);
    expect(retryPlanFor({ name: "forecast.fetch-chunk", details: { data: { gridCellIds: [] } } }).ok).toBe(false);
  });
  it("refuses unknown job names", () => {
    const r = retryPlanFor({ name: "nope.job", details: { data: {} } });
    expect(r.ok).toBe(false);
  });
  it("RUN_NOW covers the big five with valid payloads", () => {
    expect(RUN_NOW.map((r) => r.name)).toEqual(["forecast.refresh", "daily.pipeline", "reports.weekly", "reports.monthly", "reports.monthly"]);
    for (const r of RUN_NOW) expect(retryPlanFor({ name: r.name, details: { data: r.data } }).ok).toBe(true);
  });
});

describe("report publishing helpers", () => {
  it("regeneratePayload maps monthly status to phase and keeps org", () => {
    expect(regeneratePayload({ type: "weekly", scopeKey: "national", periodStart: "2026-09-28", status: "final", organizationId: null })).toEqual({
      type: "weekly",
      scopeKey: "national",
      periodStart: "2026-09-28",
    });
    expect(regeneratePayload({ type: "monthly", scopeKey: "state:3", periodStart: "2026-09-01", status: "preliminary", organizationId: "org1" })).toEqual({
      type: "monthly",
      scopeKey: "state:3",
      periodStart: "2026-09-01",
      phase: "preliminary",
      organizationId: "org1",
    });
    expect(regeneratePayload({ type: "monthly", scopeKey: "national", periodStart: "2026-09-01", status: "final", organizationId: null }).phase).toBe("final");
  });
  it("statusOnPublish never downgrades and promotes preliminary monthly on review", () => {
    expect(statusOnPublish("monthly", "final", false)).toBe("final");
    expect(statusOnPublish("monthly", "preliminary", false)).toBe("preliminary");
    expect(statusOnPublish("monthly", "preliminary", true)).toBe("final");
    expect(statusOnPublish("monthly", "draft", false)).toBe("preliminary");
    expect(statusOnPublish("weekly", "draft", false)).toBe("final");
  });
});

describe("notices", () => {
  it("scope accepts fixed scopes and place scopes", () => {
    for (const s of ["global", "home", "alerts", "reports", "place:lga:123", "place:state:7", "place:settlement:99"]) {
      expect(noticeScopeSchema.safeParse(s).success).toBe(true);
    }
    for (const s of ["", "everywhere", "place:lga:", "place:lga:abc", "place:country:1"]) {
      expect(noticeScopeSchema.safeParse(s).success).toBe(false);
    }
  });
  it("Lagos date input → end of that Lagos day in UTC, and back", () => {
    const d = lagosDateInputToExpiry("2026-10-20");
    expect(d?.toISOString()).toBe("2026-10-20T23:00:00.000Z");
    expect(expiryToLagosDateInput(d!)).toBe("2026-10-20");
    expect(lagosDateInputToExpiry("")).toBeNull();
    expect(expiryToLagosDateInput(null)).toBe("");
    expect(() => lagosDateInputToExpiry("20/10/2026")).toThrow();
  });
});

describe("plans", () => {
  it("merges typed limits and preserves other keys", () => {
    expect(mergePlanLimits({ teamMembers: 5, apiCallsPerDay: 1, downloads: false }, { apiCallsPerDay: 10, customAreas: 2, downloads: true, brandedReports: false })).toEqual({
      teamMembers: 5,
      apiCallsPerDay: 10,
      customAreas: 2,
      downloads: true,
      brandedReports: false,
    });
    expect(mergePlanLimits(null, { apiCallsPerDay: 0, customAreas: 0, downloads: false, brandedReports: false })).toEqual({
      apiCallsPerDay: 0,
      customAreas: 0,
      downloads: false,
      brandedReports: false,
    });
  });
});

describe("health + misc", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("flags ≥3 consecutive failures or stale success", () => {
    expect(isSourceUnhealthy({ consecutiveFailures: 3, lastSuccessAt: now }, now)).toBe(true);
    expect(isSourceUnhealthy({ consecutiveFailures: 0, lastSuccessAt: new Date("2026-10-07T11:00:00Z") }, now)).toBe(true);
    expect(isSourceUnhealthy({ consecutiveFailures: 2, lastSuccessAt: new Date("2026-10-08T01:00:00Z") }, now)).toBe(false);
    expect(isSourceUnhealthy({ consecutiveFailures: 0, lastSuccessAt: null }, now)).toBe(true);
  });
  it("budget counts only the current month and clamps", () => {
    expect(budgetPercent({ monthKey: "2026-10", callsThisMonth: 250 }, 1000, now)).toEqual({ calls: 250, pct: 25 });
    expect(budgetPercent({ monthKey: "2026-09", callsThisMonth: 999 }, 1000, now)).toEqual({ calls: 0, pct: 0 });
    expect(budgetPercent({ monthKey: "2026-10", callsThisMonth: 5000 }, 1000, now).pct).toBe(100);
  });
  it("durationLabel", () => {
    const s = new Date(0);
    expect(durationLabel(s, null)).toBe("—");
    expect(durationLabel(s, new Date(450))).toBe("450 ms");
    expect(durationLabel(s, new Date(12_300))).toBe("12.3 s");
    expect(durationLabel(s, new Date(600_000))).toBe("10 min");
  });
  it("pivotUsage zero-fills days and folds extra orgs into other", () => {
    const rows = [
      { day: "2026-10-01", organizationId: "a", organizationName: "A", total: 5 },
      { day: "2026-10-02", organizationId: "b", organizationName: "B", total: 9 },
      { day: "2026-10-02", organizationId: "c", organizationName: null, total: 1 },
    ];
    const { data, series } = pivotUsage(rows, ["2026-10-01", "2026-10-02", "2026-10-03"], 2);
    expect(series).toEqual([
      { key: "s0", label: "B" },
      { key: "s1", label: "A" },
      { key: "other", label: "Other" },
    ]);
    expect(data).toEqual([
      { day: "2026-10-01", s0: 0, s1: 5, other: 0 },
      { day: "2026-10-02", s0: 9, s1: 0, other: 1 },
      { day: "2026-10-03", s0: 0, s1: 0, other: 0 },
    ]);
  });
});

describe("noticeStatus", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("classifies notices", async () => {
    const { noticeStatus } = await import("@/app/staff/_lib/policy");
    expect(noticeStatus(false, null, now)).toBe("inactive");
    expect(noticeStatus(true, null, now)).toBe("live");
    expect(noticeStatus(true, new Date("2026-10-08T11:59:00Z"), now)).toBe("expired");
    expect(noticeStatus(true, new Date("2026-10-09T00:00:00Z"), now)).toBe("live");
  });
});
