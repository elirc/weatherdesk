import { and, desc, eq, inArray } from "drizzle-orm";
import { plans, subscriptions } from "@/db/schema";

/**
 * Plan limits & enforcement. The core (parsing, resolution, checks) is pure
 * and unit-tested; getOrgPlan/getUserAddon read the DB through a lazy import
 * so this module stays importable from DB-free unit tests.
 *
 * plans.limits JSON: { apiCallsPerDay, customAreas, teamMembers, downloads,
 * brandedReports, dailySends }.
 */

export type PlanLimits = {
  apiCallsPerDay: number;
  customAreas: number;
  teamMembers: number;
  downloads: boolean;
  brandedReports: boolean;
  dailySends: number;
};

export type ResolvedPlan = {
  id: string;
  name: string;
  priceKoboMonthly: number;
  limits: PlanLimits;
  /** subscription row backing this plan, null for the implicit free plan */
  subscriptionId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
};

/** Used when the 'free' plan row is missing (defensive) — mirrors the seed. */
export const FREE_LIMITS: PlanLimits = {
  apiCallsPerDay: 100,
  customAreas: 1,
  teamMembers: 1,
  downloads: false,
  brandedReports: false,
  dailySends: 0,
};

/** Subscription statuses that grant the plan's entitlements. */
export const ENTITLED_STATUSES = ["active", "trialing", "past_due"] as const;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Tolerant parse of plans.limits jsonb; unknown/invalid fields fall back to free. */
export function parsePlanLimits(raw: unknown, fallback: PlanLimits = FREE_LIMITS): PlanLimits {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    apiCallsPerDay: num(o.apiCallsPerDay, fallback.apiCallsPerDay),
    customAreas: num(o.customAreas, fallback.customAreas),
    teamMembers: num(o.teamMembers, fallback.teamMembers),
    downloads: typeof o.downloads === "boolean" ? o.downloads : fallback.downloads,
    brandedReports: typeof o.brandedReports === "boolean" ? o.brandedReports : fallback.brandedReports,
    dailySends: num(o.dailySends, fallback.dailySends),
  };
}

type PlanRow = { id: string; name: string; priceKoboMonthly: number; limits: unknown; kind: string };
type SubRow = {
  id: string;
  planId: string;
  status: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
};

/**
 * Pick the effective org plan: among entitled subscriptions (not expired),
 * the most expensive org plan wins (an upgrade overlapping an old row never
 * downgrades). No entitled subscription → the free plan.
 */
export function resolvePlan(subs: SubRow[], planRows: PlanRow[], now: Date = new Date()): ResolvedPlan {
  const byId = new Map(planRows.map((p) => [p.id, p]));
  const free = byId.get("free");
  const freePlan: ResolvedPlan = {
    id: "free",
    name: free?.name ?? "Free",
    priceKoboMonthly: 0,
    limits: parsePlanLimits(free?.limits, FREE_LIMITS),
    subscriptionId: null,
    status: "active",
    currentPeriodEnd: null,
  };
  let best: ResolvedPlan | null = null;
  for (const s of subs) {
    if (!(ENTITLED_STATUSES as readonly string[]).includes(s.status)) continue;
    if (s.currentPeriodEnd && s.currentPeriodEnd.getTime() < now.getTime()) continue;
    const p = byId.get(s.planId);
    if (!p || p.kind !== "org") continue;
    if (!best || p.priceKoboMonthly > best.priceKoboMonthly) {
      best = {
        id: p.id,
        name: p.name,
        priceKoboMonthly: p.priceKoboMonthly,
        limits: parsePlanLimits(p.limits, freePlan.limits),
        subscriptionId: s.id,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd,
      };
    }
  }
  return best ?? freePlan;
}

export type LimitKind = "customAreas" | "teamMembers" | "apiCallsPerDay" | "downloads" | "brandedReports" | "dailySends";

export type LimitCheck = { ok: boolean; limit: number; used: number; remaining: number };

/** Numeric limits: `used` is the count BEFORE the new item; boolean limits ignore `used`. */
export function checkLimit(kind: LimitKind, limits: PlanLimits, used = 0): LimitCheck {
  const v = limits[kind];
  if (typeof v === "boolean") {
    return { ok: v, limit: v ? 1 : 0, used: 0, remaining: v ? 1 : 0 };
  }
  return { ok: used < v, limit: v, used, remaining: Math.max(0, v - used) };
}

export class LimitError extends Error {
  constructor(
    public readonly kind: LimitKind,
    public readonly check: LimitCheck,
  ) {
    super(limitMessage(kind, check));
    this.name = "LimitError";
  }
}

const LABELS: Record<LimitKind, string> = {
  customAreas: "custom areas",
  teamMembers: "team members",
  apiCallsPerDay: "API calls per day",
  downloads: "data downloads",
  brandedReports: "branded reports",
  dailySends: "daily forecast sends",
};

export function limitMessage(kind: LimitKind, c: LimitCheck): string {
  if (kind === "downloads" || kind === "brandedReports") {
    return `Your plan does not include ${LABELS[kind]}. Upgrade to unlock them.`;
  }
  return `Plan limit reached: ${c.used} of ${c.limit} ${LABELS[kind]}. Upgrade for more.`;
}

export function assertWithinLimit(kind: LimitKind, limits: PlanLimits, used = 0): LimitCheck {
  const c = checkLimit(kind, limits, used);
  if (!c.ok) throw new LimitError(kind, c);
  return c;
}

// ── DB-backed helpers (lazy db import keeps unit tests DB-free) ─────────

export async function listPlanRows(): Promise<PlanRow[]> {
  const { db } = await import("@/db");
  return db
    .select({
      id: plans.id,
      name: plans.name,
      priceKoboMonthly: plans.priceKoboMonthly,
      limits: plans.limits,
      kind: plans.kind,
    })
    .from(plans);
}

/** Effective plan for an organisation (active subscription → plan, else free). */
export async function getOrgPlan(organizationId: string): Promise<ResolvedPlan> {
  const { db } = await import("@/db");
  const [subs, planRows] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          inArray(subscriptions.status, [...ENTITLED_STATUSES]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt)),
    listPlanRows(),
  ]);
  return resolvePlan(subs, planRows);
}

/** The user's entitled personal add-on subscription for a plan (e.g. 'sms_daily'), or null. */
export async function getUserAddon(
  userId: string,
  planId: string,
  now: Date = new Date(),
): Promise<{ id: string; status: string; currentPeriodEnd: Date | null } | null> {
  const { db } = await import("@/db");
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.planId, planId),
        inArray(subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt));
  return rows.find((r) => !r.currentPeriodEnd || r.currentPeriodEnd.getTime() >= now.getTime()) ?? null;
}
