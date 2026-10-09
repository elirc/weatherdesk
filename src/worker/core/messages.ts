import type { EmailMessage } from "@/adapters/types";
import { formatLagosDate, lagosMidnightUtc } from "@/lib/time";

/**
 * Notification text rendering (pure).
 *
 * notifications.payload convention (written by this worker; other writers
 * should follow it so notificationSend can deliver them):
 *   { subject?: string; text: string; html?: string; to?: string; ... }
 * `to` overrides the recipient (phone for sms/whatsapp); otherwise the user's
 * email / phone number is used.
 */

export const DISCLAIMER = "Independent service - not affiliated with NiMet. Advisories are not official warnings.";
export const SMS_DISCLAIMER = "Not an official NiMet warning.";

/** Stored-file reference for an email attachment (A5 sets it only for PDFs < 2 MB). */
export type AttachmentRef = { key: string; filename: string; contentType: string };

/**
 * Binding payload convention (A5 report notifications use all fields):
 * { subject?, text, html?, to?, reportId?, url?, pdfUrl?, attachment? }
 */
export type NotificationPayload = {
  subject?: string;
  text: string;
  html?: string;
  to?: string;
  reportId?: string;
  url?: string;
  pdfUrl?: string;
  attachment?: AttachmentRef;
  [k: string]: unknown;
};

/** The payload's attachment reference, or null when absent or malformed (never throws). */
export function attachmentRef(payload: NotificationPayload): AttachmentRef | null {
  const a = payload.attachment as Partial<AttachmentRef> | null | undefined;
  if (!a || typeof a !== "object") return null;
  if (typeof a.key !== "string" || !a.key) return null;
  if (typeof a.filename !== "string" || !a.filename) return null;
  return {
    key: a.key,
    filename: a.filename,
    // "" → buildEmailMessage falls back to the stored object's content type
    contentType: typeof a.contentType === "string" ? a.contentType : "",
  };
}

/**
 * Payload → EmailMessage. `file` is the storage read for the payload's
 * attachment: when it is null (missing object / no attachment) the email goes
 * out without one — the text already carries the PDF link.
 */
export function buildEmailMessage(
  payload: NotificationPayload,
  to: string,
  appUrl: string,
  file: { content: Buffer; contentType: string } | null,
): EmailMessage {
  const subject = payload.subject ?? "WeatherDesk";
  const ref = attachmentRef(payload);
  return {
    to,
    subject,
    text: payload.text,
    html: payload.html ?? renderEmailHtml(subject, payload.text, appUrl),
    ...(ref && file
      ? { attachments: [{ filename: ref.filename, content: file.content, contentType: ref.contentType || file.contentType }] }
      : {}),
  };
}

export function parsePayload(p: unknown): NotificationPayload {
  if (!p || typeof p !== "object") throw new Error("notification payload is not an object");
  const o = p as Record<string, unknown>;
  if (typeof o.text !== "string" || !o.text) throw new Error("notification payload.text missing");
  return o as NotificationPayload;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Simple, inline-styled email HTML for a plain-text message. */
export function renderEmailHtml(subject: string, text: string, appUrl: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replaceAll("\n", "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:16px">
<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h2>${paras}
<p style="font-size:12px;color:#555;margin-top:24px">${escapeHtml(DISCLAIMER)}<br>Data: Open-Meteo, NASA POWER. <a href="${escapeHtml(appUrl)}">WeatherDesk</a></p>
</body></html>`;
}

export function alertEmail(input: {
  lgaName: string;
  type: string;
  text: string;
  appUrl: string;
}): { subject: string; text: string } {
  const label: Record<string, string> = {
    heavy_rain: "Heavy rain",
    heat: "Extreme heat",
    wind: "Strong wind",
    dry_spell: "Dry spell",
  };
  const subject = `WeatherDesk advisory: ${label[input.type] ?? input.type} - ${input.lgaName}`;
  const text = `${input.text}\n\nSee details: ${input.appUrl}/alerts\n\n${DISCLAIMER}`;
  return { subject, text };
}

export type DayForecastLite = {
  date: string;
  tmaxC: number | null;
  tminC: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  gustsMaxKmh: number | null;
};

const r0 = (v: number | null) => (v == null ? "-" : String(Math.round(v)));

/** One-day forecast SMS (kept short for a single 160-char GSM segment where possible). */
export function dailyForecastText(placeName: string, day: DayForecastLite): string {
  const date = formatLagosDate(lagosMidnightUtc(day.date));
  const parts = [`${placeName} ${date}: ${r0(day.tminC)}-${r0(day.tmaxC)}C`];
  if (day.rainMm != null || day.rainProbPct != null) {
    parts.push(`rain ${day.rainMm == null ? "-" : day.rainMm.toFixed(1)}mm (${r0(day.rainProbPct)}%)`);
  }
  if (day.gustsMaxKmh != null) parts.push(`gusts ${r0(day.gustsMaxKmh)}km/h`);
  return `WeatherDesk ${parts.join(", ")}. ${SMS_DISCLAIMER}`;
}
