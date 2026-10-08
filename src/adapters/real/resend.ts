/**
 * Resend email driver (real).
 *
 * Docs (verified 2026-10-08): https://resend.com/docs/api-reference/emails/send-email
 *   POST https://api.resend.com/emails, Authorization: Bearer <key>
 *   { from, to[], subject, html, text?, attachments?: [{ filename, content (base64), content_type }] }
 *   → { id }
 */

import { env } from "@/lib/env";
import type { EmailAdapter, EmailMessage } from "../types";
import { fetchJson, tracked } from "./http";
import { resendBody } from "./mappers/messaging";

const SOURCE = "resend";

export const resendAdapter: EmailAdapter = {
  name: SOURCE,
  async send(msg: EmailMessage) {
    if (!env.RESEND_API_KEY) throw new Error("resend: RESEND_API_KEY is not set");
    const key = env.RESEND_API_KEY;
    const res = await tracked(SOURCE, () =>
      fetchJson<{ id?: string }>(SOURCE, "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(resendBody(msg, env.EMAIL_FROM)),
        label: "emails",
      }),
    );
    if (!res.id) throw new Error("resend: response has no id");
    return { id: res.id };
  },
};
