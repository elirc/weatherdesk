/**
 * Small pure helpers shared by the accounts/org/billing UI and actions.
 */

/** Only same-site relative paths survive as ?next= targets (no //host, no schemes). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

/** Org slug from a name: lowercase, ascii, hyphenated, ≤ 40 chars + short suffix for uniqueness. */
export function slugifyOrgName(name: string, suffix?: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "org";
  return suffix ? `${base}-${suffix}` : base;
}

/** Monday (YYYY-MM-DD) of the week before the week containing `today` (a Lagos civil date). */
export function previousWeekMonday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d.toISOString().slice(0, 10);
}

/** Nigerian phone input → E.164 (+234…). Accepts 080…, 234…, +234…; null if not a plausible NG mobile. */
export function toE164Ng(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  let national: string | null = null;
  if (/^\+234\d{10}$/.test(digits)) national = digits.slice(4);
  else if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  if (!national || !/^[789]\d{9}$/.test(national)) return null;
  return `+234${national}`;
}

/** "07:00" style hour options for the daily-send picker (Lagos local). */
export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Logo upload rules. */
export const LOGO_MAX_BYTES = 500 * 1024;
export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg" } as const;

/** Magic-number sniff — the declared content type is not trusted. */
export function sniffImageType(buf: Uint8Array): "image/png" | "image/jpeg" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/** Parse organizations.metadata (text JSON) tolerantly. */
export function parseOrgMetadata(raw: string | null | undefined): { brandTitle?: string } & Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Escape one CSV field (RFC 4180). */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
