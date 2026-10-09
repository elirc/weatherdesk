import { z } from "zod";

/**
 * Paystack webhook event parsing (pure). Shapes follow A2's verified
 * contract (src/adapters/real/paystack.ts header; official OpenAPI spec).
 * Parsing is lenient (passthrough) — we only read the fields we need.
 * The signature is verified over the RAW body BEFORE this runs.
 *
 * - charge.success        data.reference, data.amount, data.customer.customer_code
 * - subscription.create   data.subscription_code, data.customer.customer_code,
 *                         data.plan.plan_code, data.next_payment_date
 * - subscription.disable / subscription.not_renew   data.subscription_code
 * - invoice.payment_failed  data.subscription.subscription_code
 */

const customer = z.object({ customer_code: z.string().optional(), email: z.string().optional() }).passthrough();

export const paystackEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("charge.success"),
    data: z
      .object({
        reference: z.string(),
        amount: z.number().optional(),
        status: z.string().optional(),
        customer: customer.optional(),
      })
      .passthrough(),
  }),
  z.object({
    event: z.literal("subscription.create"),
    data: z
      .object({
        subscription_code: z.string(),
        next_payment_date: z.string().nullable().optional(),
        customer: customer.optional(),
        plan: z.object({ plan_code: z.string().optional() }).passthrough().optional(),
      })
      .passthrough(),
  }),
  z.object({
    event: z.enum(["subscription.disable", "subscription.not_renew"]),
    data: z.object({ subscription_code: z.string(), status: z.string().optional() }).passthrough(),
  }),
  z.object({
    event: z.literal("invoice.payment_failed"),
    data: z
      .object({ subscription: z.object({ subscription_code: z.string() }).passthrough().optional() })
      .passthrough(),
  }),
]);

export type PaystackEvent = z.infer<typeof paystackEventSchema>;

/** Parse an already-verified raw body. Unknown events → { ignored: true }. */
export function parsePaystackEvent(rawBody: string): { ok: true; event: PaystackEvent } | { ok: false; ignored: boolean; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, ignored: false, error: "invalid JSON" };
  }
  const parsed = paystackEventSchema.safeParse(json);
  if (parsed.success) return { ok: true, event: parsed.data };
  const name = (json as { event?: unknown })?.event;
  return { ok: false, ignored: typeof name === "string", error: `unhandled or malformed event ${String(name)}` };
}

/** One month after `from` (calendar month, clamped) — period end for a fresh paid checkout. */
export function addOneMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Paystack references: only alphanumerics, '-', '.', '='. Our references are subscription UUIDs. */
export const REFERENCE_PATTERN = /^[A-Za-z0-9.=-]{8,100}$/;
