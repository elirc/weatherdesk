import "server-only";
import { getPaymentsAdapter } from "@/adapters";
import { env } from "@/lib/env";
import type { SessionUser } from "@/lib/authz";
import { activateSubscription, createPendingSubscription, getPlan, getSubscription } from "@/server/queries/billing";
import { addOneMonth, REFERENCE_PATTERN } from "./paystack";

/**
 * Paystack checkout orchestration. Callers MUST have done authz first
 * (requireOrgMember(org, "admin") for org plans, requireUser for add-ons).
 */

export async function startCheckout(input: {
  user: SessionUser;
  planId: string;
  organizationId?: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const plan = await getPlan(input.planId);
  if (!plan || !plan.active) throw new Error("Unknown plan");
  if (plan.priceKoboMonthly <= 0) throw new Error("Free plans need no checkout");
  if (input.organizationId ? plan.kind !== "org" : plan.kind !== "personal_addon") {
    throw new Error("Plan does not match the purchaser");
  }
  const reference = await createPendingSubscription({
    organizationId: input.organizationId,
    userId: input.user.id,
    planId: plan.id,
  });
  const res = await getPaymentsAdapter().initializeTransaction({
    email: input.user.email,
    amountKobo: plan.priceKoboMonthly,
    planCode: plan.paystackPlanCode ?? undefined,
    reference,
    callbackUrl: `${env.APP_URL.replace(/\/$/, "")}/billing/callback`,
    metadata: { planId: plan.id, organizationId: input.organizationId ?? null, userId: input.user.id },
  });
  return res;
}

export type FinalizeResult =
  | { ok: true; organizationId: string | null; planId: string }
  | { ok: false; error: string; organizationId: string | null };

/**
 * Verify a reference with Paystack and activate the pending row. The
 * subscription code is NOT available here (Paystack sends it via the
 * subscription.create webhook).
 */
export async function finalizeCheckout(reference: string): Promise<FinalizeResult> {
  if (!REFERENCE_PATTERN.test(reference)) return { ok: false, error: "Invalid reference", organizationId: null };
  const sub = await getSubscription(reference);
  if (!sub) return { ok: false, error: "Unknown checkout reference", organizationId: null };
  const plan = await getPlan(sub.planId);
  if (!plan) return { ok: false, error: "Unknown plan", organizationId: sub.organizationId };
  const adapter = getPaymentsAdapter();
  const v = await adapter.verifyTransaction(reference);
  if (v.status !== "success") {
    return { ok: false, error: v.status === "pending" ? "Payment still pending" : "Payment failed", organizationId: sub.organizationId };
  }
  // mock driver reports amount 0; real Paystack must have charged at least the plan price
  if (adapter.name !== "mock" && v.amountKobo < plan.priceKoboMonthly) {
    return { ok: false, error: "Amount mismatch", organizationId: sub.organizationId };
  }
  await activateSubscription(reference, { customerCode: v.customerCode ?? null, currentPeriodEnd: addOneMonth(new Date()) });
  return { ok: true, organizationId: sub.organizationId, planId: sub.planId };
}
