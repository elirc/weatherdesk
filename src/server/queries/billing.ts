import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { dailySendSubscriptions, plans, subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ENTITLED_STATUSES } from "@/lib/api/limits";

/**
 * Billing queries (A6). Checkout flow:
 *   1. createPendingSubscription → row with status 'pending'; its id is the
 *      Paystack transaction reference (UUID chars are Paystack-safe).
 *   2. /billing/callback verifies the reference → activateSubscription.
 *   3. Webhooks: charge.success (idempotent activate), subscription.create
 *      (captures subscription_code — verify never returns it),
 *      subscription.disable/not_renew → canceled, invoice.payment_failed → past_due.
 * Status values: pending | active | past_due | canceled | trialing.
 */

export type PlanRow = typeof plans.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;

export async function listPlans(kind?: "org" | "personal_addon"): Promise<PlanRow[]> {
  return db
    .select()
    .from(plans)
    .where(kind ? and(eq(plans.active, true), eq(plans.kind, kind)) : eq(plans.active, true))
    .orderBy(asc(plans.priceKoboMonthly));
}

export async function getPlan(id: string): Promise<PlanRow | null> {
  const [p] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return p ?? null;
}

export async function createPendingSubscription(input: {
  organizationId?: string;
  userId?: string;
  planId: string;
}): Promise<string> {
  const id = newId();
  await db.insert(subscriptions).values({
    id,
    organizationId: input.organizationId ?? null,
    userId: input.organizationId ? null : (input.userId ?? null),
    planId: input.planId,
    status: "pending",
  });
  return id;
}

export async function getSubscription(id: string): Promise<SubscriptionRow | null> {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return s ?? null;
}

/**
 * Idempotent: pending/any → active with period end; supersedes other
 * entitled subscriptions of the same owner (org: any org plan; user: same plan).
 */
export async function activateSubscription(
  id: string,
  input: { customerCode?: string | null; currentPeriodEnd: Date },
): Promise<SubscriptionRow | null> {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1).for("update");
    if (!s) return null;
    if (s.status === "canceled") return s; // never resurrect a canceled row from a late event
    const now = new Date();
    const [updated] = await tx
      .update(subscriptions)
      .set({
        status: "active",
        paystackCustomerCode: input.customerCode ?? s.paystackCustomerCode,
        currentPeriodEnd: s.status === "active" && s.currentPeriodEnd ? s.currentPeriodEnd : input.currentPeriodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, id))
      .returning();
    const ownerCond = s.organizationId
      ? eq(subscriptions.organizationId, s.organizationId)
      : and(eq(subscriptions.userId, s.userId ?? "__none__"), eq(subscriptions.planId, s.planId));
    await tx
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: now })
      .where(and(ownerCond, ne(subscriptions.id, id), inArray(subscriptions.status, [...ENTITLED_STATUSES])));
    return updated ?? null;
  });
}

/** subscription.create webhook: attach the code to the newest active row for that customer without one. */
export async function attachSubscriptionCode(input: {
  customerCode: string;
  subscriptionCode: string;
  nextPaymentDate: Date | null;
}): Promise<number> {
  const [target] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.paystackCustomerCode, input.customerCode),
        isNull(subscriptions.paystackSubscriptionCode),
        inArray(subscriptions.status, [...ENTITLED_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  if (!target) return 0;
  await db
    .update(subscriptions)
    .set({
      paystackSubscriptionCode: input.subscriptionCode,
      ...(input.nextPaymentDate ? { currentPeriodEnd: input.nextPaymentDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, target.id));
  return 1;
}

/** subscription.disable / not_renew → canceled; a canceled sms_daily also stops the user's daily sends. */
export async function setStatusBySubscriptionCode(code: string, status: "canceled" | "past_due"): Promise<number> {
  const rows = await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.paystackSubscriptionCode, code))
    .returning({ userId: subscriptions.userId, planId: subscriptions.planId });
  if (status === "canceled") {
    for (const r of rows) {
      if (r.userId && r.planId === "sms_daily") {
        await db.update(dailySendSubscriptions).set({ active: false }).where(eq(dailySendSubscriptions.userId, r.userId));
      }
    }
  }
  return rows.length;
}

/** User-initiated cancel of a personal add-on (scoped by userId). */
export async function cancelUserSubscription(userId: string, subscriptionId: string): Promise<boolean> {
  const rows = await db
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)))
    .returning({ planId: subscriptions.planId });
  if (rows[0]?.planId === "sms_daily") {
    await db.update(dailySendSubscriptions).set({ active: false }).where(eq(dailySendSubscriptions.userId, userId));
  }
  return rows.length > 0;
}

export async function listOrgSubscriptions(organizationId: string) {
  return db
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      planName: plans.name,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      paystackSubscriptionCode: subscriptions.paystackSubscriptionCode,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organizationId, organizationId), ne(subscriptions.status, "pending")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(20);
}
