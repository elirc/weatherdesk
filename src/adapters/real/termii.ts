/**
 * Termii SMS + WhatsApp driver (real).
 *
 * Docs (verified 2026-10-08): https://developers.termii.com/messaging-api
 *   POST {BASE_URL}/api/sms/send  JSON { api_key, to, from, sms, type, channel }
 *   channel: 'dnd' (transactional) | 'generic' | 'whatsapp'; response { message_id, ... }.
 * The base URL is account-specific ("found on your dashboard"). env.ts has no
 * field for it, so TERMII_BASE_URL is read from process.env directly with the
 * commonly published Nigerian host as fallback (reported as contract friction).
 */

import { env } from "@/lib/env";
import type { SmsAdapter, SmsMessage } from "../types";
import { fetchJson, tracked } from "./http";
import { termiiBody, termiiMessageId } from "./mappers/messaging";

const SOURCE = "termii";
const baseUrl = () => (process.env.TERMII_BASE_URL || "https://api.ng.termii.com").replace(/\/+$/, "");

export const termiiAdapter: SmsAdapter = {
  name: SOURCE,
  async send(msg: SmsMessage) {
    if (!env.TERMII_API_KEY) throw new Error("termii: TERMII_API_KEY is not set");
    const body = termiiBody(msg, env.TERMII_API_KEY, env.TERMII_SENDER_ID);
    const res = await tracked(SOURCE, () =>
      fetchJson<{ message_id?: string; message_id_str?: string; code?: string; message?: string }>(
        SOURCE,
        `${baseUrl()}/api/sms/send`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), label: msg.channel },
      ),
    );
    return { id: termiiMessageId(res) };
  },
};
