import { getPaymentsAdapter } from "@/adapters";
import { addOneMonth, parsePaystackEvent } from "@/lib/api/paystack";
import { finalizeCheckout } from "@/lib/api/checkout";
import { activateSubscription, attachSubscriptionCode, getSubscription, setStatusBySubscriptionCode } from "@/server/queries/billing";

/**
 * POST /api/webhooks/paystack — authz is the signature (CONVENTIONS 9):
 * x-paystack-signature = HMAC-SHA512(raw body, secret) is verified over the
 * RAW text BEFORE any JSON parsing. Bad/missing signature → 401.
 * Handlers are idempotent; unknown events are acknowledged with 200 so
 * Paystack stops retrying.
 */
export async function POST(request: Request) {
  const raw = await request.text(); // raw body first — never request.json() here
  const signature = request.headers.get("x-paystack-signature") ?? "";
  if (!signature || !getPaymentsAdapter().verifyWebhookSignature(raw, signature)) {
    return Response.json({ error: { code: "unauthorized", message: "invalid signature" } }, { status: 401 });
  }

  const parsed = parsePaystackEvent(raw);
  if (!parsed.ok) {
    return Response.json({ received: true, ignored: parsed.ignored, note: parsed.error }, { status: parsed.ignored ? 200 : 400 });
  }
  const { event } = parsed;
  switch (event.event) {
    case "charge.success": {
      const sub = await getSubscription(event.data.reference);
      if (!sub) return Response.json({ received: true, matched: false });
      if (sub.status === "pending") {
        // the callback may never be hit (closed tab) — verify + activate here too
        const res = await finalizeCheckout(event.data.reference);
        return Response.json({ received: true, activated: res.ok });
      }
      // renewal charge: extend the period
      await activateSubscription(sub.id, {
        customerCode: event.data.customer?.customer_code ?? null,
        currentPeriodEnd: addOneMonth(new Date()),
      });
      return Response.json({ received: true, renewed: true });
    }
    case "subscription.create": {
      const customerCode = event.data.customer?.customer_code;
      if (!customerCode) return Response.json({ received: true, matched: 0 });
      const next = event.data.next_payment_date ? new Date(event.data.next_payment_date) : null;
      const matched = await attachSubscriptionCode({
        customerCode,
        subscriptionCode: event.data.subscription_code,
        nextPaymentDate: next && !Number.isNaN(next.getTime()) ? next : null,
      });
      return Response.json({ received: true, matched });
    }
    case "subscription.disable":
    case "subscription.not_renew": {
      const n = await setStatusBySubscriptionCode(event.data.subscription_code, "canceled");
      return Response.json({ received: true, updated: n });
    }
    case "invoice.payment_failed": {
      const code = event.data.subscription?.subscription_code;
      const n = code ? await setStatusBySubscriptionCode(code, "past_due") : 0;
      return Response.json({ received: true, updated: n });
    }
  }
}
