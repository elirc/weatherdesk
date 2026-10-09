import { createHash, timingSafeEqual } from "node:crypto";

/**
 * API key primitives (pure, DB-free). Plaintext keys look like
 * `wd_live_<40 hex>` (see newApiKeyPlaintext in src/lib/ids.ts); only the
 * SHA-256 hex digest is stored (api_keys.key_hash) and the first
 * KEY_PREFIX_LENGTH chars are kept for display (api_keys.prefix).
 * The DB lookup lives in src/lib/api/guard.ts.
 */

export const KEY_PATTERN = /^wd_live_[0-9a-f]{40}$/;
/** "wd_live_" + 6 hex — enough to recognise a key in the UI, useless to an attacker. */
export const KEY_PREFIX_LENGTH = 14;

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function apiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, KEY_PREFIX_LENGTH);
}

export function isApiKeyFormat(token: string): boolean {
  return KEY_PATTERN.test(token);
}

/** Constant-time comparison of a plaintext key against a stored hash. */
export function verifyApiKey(plaintext: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(plaintext), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * Extracts the token from an Authorization header.
 * - null header → { kind: "none" } (anonymous preview)
 * - "Bearer wd_live_…" with a well-formed key → { kind: "key", token }
 * - anything else → { kind: "invalid" } (401, never silently anonymous)
 */
export function parseBearer(
  header: string | null | undefined,
): { kind: "none" } | { kind: "invalid" } | { kind: "key"; token: string } {
  if (header == null || header.trim() === "") return { kind: "none" };
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!m || !isApiKeyFormat(m[1]!)) return { kind: "invalid" };
  return { kind: "key", token: m[1]! };
}
