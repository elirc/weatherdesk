import { sql } from "drizzle-orm";
import { plans } from "@/db/schema";
import { nairaToKobo } from "@/lib/money";
import type { SeedStep } from "../lib/seed-types";

/**
 * Plans. PRICES ARE PLACEHOLDERS (integer kobo) — see CONVENTIONS / README
 * Assumptions. limits jsonb: { apiCallsPerDay, customAreas, downloads,
 * brandedReports } (+ teamMembers, informational). Upsert on id.
 */
export const PLAN_SEED = [
  {
    id: "free",
    name: "Free",
    kind: "org" as const,
    priceKoboMonthly: nairaToKobo(0),
    limits: { apiCallsPerDay: 100, customAreas: 1, downloads: false, brandedReports: false, teamMembers: 1 },
    features: { api: true, customAreas: true, downloads: false, brandedReports: false },
  },
  {
    id: "org_basic",
    name: "Organisation Basic",
    kind: "org" as const,
    priceKoboMonthly: nairaToKobo(50_000),
    limits: { apiCallsPerDay: 10_000, customAreas: 5, downloads: true, brandedReports: true, teamMembers: 5 },
    features: { api: true, customAreas: true, downloads: true, brandedReports: true },
  },
  {
    id: "org_pro",
    name: "Organisation Pro",
    kind: "org" as const,
    priceKoboMonthly: nairaToKobo(200_000),
    limits: { apiCallsPerDay: 100_000, customAreas: 25, downloads: true, brandedReports: true, teamMembers: 25 },
    features: { api: true, customAreas: true, downloads: true, brandedReports: true, prioritySupport: true },
  },
  {
    id: "sms_daily",
    name: "Daily SMS forecast",
    kind: "personal_addon" as const,
    priceKoboMonthly: nairaToKobo(1_000),
    limits: { apiCallsPerDay: 0, customAreas: 0, downloads: false, brandedReports: false, dailySends: 1 },
    features: { dailySms: true, whatsapp: true },
  },
];

export const step: SeedStep = {
  name: "plans",
  async run({ db }) {
    await db
      .insert(plans)
      .values(PLAN_SEED.map((p) => ({ ...p, active: true })))
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          priceKoboMonthly: sql`excluded.price_kobo_monthly`,
          limits: sql`excluded.limits`,
          features: sql`excluded.features`,
        },
      });
    return { plans: PLAN_SEED.length };
  },
};
