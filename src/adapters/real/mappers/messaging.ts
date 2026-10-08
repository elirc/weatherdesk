/**
 * Pure request/response mapping for Termii, Resend and Paystack.
 *
 * Termii   https://developers.termii.com/messaging-api   (POST {BASE_URL}/api/sms/send)
 * Resend   https://resend.com/docs/api-reference/emails/send-email
 * Paystack https://paystack.com/docs/api/transaction/ and
 *          https://paystack.com/docs/payments/webhooks/ (docs site blocks bots;
 *          verified against the official OpenAPI spec
 *          https://raw.githubusercontent.com/PaystackOSS/openapi/main/dist/paystack.yaml)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailMessage, SmsMessage } from "../../types";

// ── Termii ──────────────────────────────────────────────────────────────

/** Termii wants international format without '+', e.g. 2348012345678. */
export function termiiNumber(e164: string): string {
  return e164.replace(/[^\d]/g, "");
}

export function termiiBody(msg: SmsMessage, apiKey: string, senderId: string) {
  return {
    api_key: apiKey,
    to: termiiNumber(msg.to),
    from: senderId,
    sms: msg.body,
    type: "plain",
    // 'dnd' = transactional route (delivers to DND numbers; needed for OTPs/alerts)
    channel: msg.channel === "whatsapp" ? "whatsapp" : "dnd",
  };
}

export function termiiMessageId(res: { message_id?: string; message_id_str?: string; code?: string; message?: string }): string {
  const id = res.message_id_str ?? res.message_id;
  if (!id) throw new Error(`termii: no message_id in response (${res.code ?? ""} ${res.message ?? ""})`.trim());
  return String(id);
}

// ── Resend ──────────────────────────────────────────────────────────────

export function resendBody(msg: EmailMessage, from: string) {
  return {
    from,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    ...(msg.text ? { text: msg.text } : {}),
    ...(msg.attachments?.length
      ? {
          attachments: msg.attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString("base64"),
            content_type: a.contentType,
          })),
        }
      : {}),
  };
}

// ── Paystack ────────────────────────────────────────────────────────────

export type PaystackVerifyData = {
  status?: string;
  amount?: number;
  customer?: { customer_code?: string } | null;
  plan?: string | null;
  plan_object?: { plan_code?: string } | Record<string, never> | null;
};

/** Paystack transaction status → contract status. Only 'success' is paid. */
export function mapPaystackStatus(s: string | undefined): "success" | "failed" | "pending" {
  if (s === "success") return "success";
  if (s === "failed" || s === "abandoned" || s === "reversed") return "failed";
  return "pending"; // ongoing, pending, processing, queued, …
}

export function mapPaystackVerify(data: PaystackVerifyData) {
  const planObj = data.plan_object as { plan_code?: string } | null | undefined;
  return {
    status: mapPaystackStatus(data.status),
    amountKobo: Math.round(data.amount ?? 0),
    customerCode: data.customer?.customer_code ?? undefined,
    // verify responses carry no subscription code — it arrives via the subscription.create webhook
    subscriptionCode: undefined,
    planCode: planObj?.plan_code ?? data.plan ?? undefined,
  };
}

/** x-paystack-signature = hex HMAC-SHA512 of the raw body keyed with the secret key. */
export function paystackSignature(rawBody: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
}

export function verifyPaystackSignature(rawBody: string, signature: string, secretKey: string | undefined): boolean {
  if (!secretKey || !signature) return false;
  const expected = Buffer.from(paystackSignature(rawBody, secretKey), "utf8");
  const given = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
