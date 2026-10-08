import { randomBytes, randomUUID } from "node:crypto";

/** Primary keys for text-id tables. */
export function newId(): string {
  return randomUUID();
}

/** API key plaintext: wd_live_<40 hex>. Shown once; only the hash is stored. */
export function newApiKeyPlaintext(): string {
  return `wd_live_${randomBytes(20).toString("hex")}`;
}
