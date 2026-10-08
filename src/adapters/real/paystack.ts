/**
 * Paystack payments driver (real).
 *
 * Docs: https://paystack.com/docs/api/transaction/ and
 *       https://paystack.com/docs/payments/webhooks/
 * (docs site returns 403 to automated fetches; verified 2026-10-08 against the
 *  official OpenAPI spec https://raw.githubusercontent.com/PaystackOSS/openapi/main/dist/paystack.yaml)
 *   POST https://api.paystack.co/transaction/initialize { email, amount (kobo), reference, callback_url, plan?, metadata? }
 *     → data.authorization_url, data.reference
 *   GET  https://api.paystack.co/transaction/verify/{reference}
 *     → data.status, data.amount, data.customer.customer_code, data.plan / data.plan_object.plan_code
 *     (no subscription code in verify — it arrives via the subscription.create webhook)
 *   Webhook: x-paystack-signature = hex HMAC-SHA512(raw body, secret key).
 */

import { env } from "@/lib/env";
import type { PaymentsAdapter } from "../types";
import { fetchJson, tracked } from "./http";
import { mapPaystackVerify, verifyPaystackSignature, type PaystackVerifyData } from "./mappers/messaging";

const SOURCE = "paystack";
const BASE = "https://api.paystack.co";

function secret(): string {
  if (!env.PAYSTACK_SECRET_KEY) throw new Error("paystack: PAYSTACK_SECRET_KEY is not set");
  return env.PAYSTACK_SECRET_KEY;
}

type Envelope<T> = { status: boolean; message?: string; data?: T };

function unwrap<T>(res: Envelope<T>, what: string): T {
  if (!res.status || !res.data) throw new Error(`paystack ${what}: ${res.message ?? "request failed"}`);
  return res.data;
}

export const paystackAdapter: PaymentsAdapter = {
  name: SOURCE,

  async initializeTransaction(input) {
    if (!Number.isInteger(input.amountKobo) || input.amountKobo < 0) {
      throw new Error("paystack: amountKobo must be a non-negative integer");
    }
    const key = secret();
    const res = await tracked(SOURCE, () =>
      fetchJson<Envelope<{ authorization_url: string; reference: string }>>(SOURCE, `${BASE}/transaction/initialize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          callback_url: input.callbackUrl,
          ...(input.planCode ? { plan: input.planCode } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        }),
        label: "initialize",
      }),
    );
    const data = unwrap(res, "initialize");
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  },

  async verifyTransaction(reference) {
    const key = secret();
    const res = await tracked(SOURCE, () =>
      fetchJson<Envelope<PaystackVerifyData>>(SOURCE, `${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${key}` },
        label: "verify",
      }),
    );
    return mapPaystackVerify(unwrap(res, "verify"));
  },

  verifyWebhookSignature(rawBody, signature) {
    return verifyPaystackSignature(rawBody, signature, env.PAYSTACK_SECRET_KEY);
  },
};
