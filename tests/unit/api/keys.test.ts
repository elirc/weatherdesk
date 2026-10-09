import { describe, expect, it } from "vitest";
import { newApiKeyPlaintext } from "@/lib/ids";
import { apiKeyPrefix, hashApiKey, isApiKeyFormat, KEY_PREFIX_LENGTH, parseBearer, verifyApiKey } from "@/lib/api/keys";

describe("api key hashing", () => {
  it("round-trips: a fresh key verifies against its own hash", () => {
    const key = newApiKeyPlaintext();
    expect(isApiKeyFormat(key)).toBe(true);
    const h = hashApiKey(key);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyApiKey(key, h)).toBe(true);
  });

  it("is deterministic sha256 hex (known vector)", () => {
    // sha256("abc")
    expect(hashApiKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects a different key and malformed hashes", () => {
    const a = newApiKeyPlaintext();
    const b = newApiKeyPlaintext();
    expect(a).not.toBe(b);
    expect(verifyApiKey(b, hashApiKey(a))).toBe(false);
    expect(verifyApiKey(a, "")).toBe(false);
    expect(verifyApiKey(a, "zz")).toBe(false);
  });

  it("display prefix keeps wd_live_ + 6 hex and never the full secret", () => {
    const key = newApiKeyPlaintext();
    const p = apiKeyPrefix(key);
    expect(p).toHaveLength(KEY_PREFIX_LENGTH);
    expect(p.startsWith("wd_live_")).toBe(true);
    expect(key.startsWith(p)).toBe(true);
    expect(p.length).toBeLessThan(key.length);
  });
});

describe("parseBearer", () => {
  const key = `wd_live_${"a".repeat(40)}`;
  it("no header → anonymous", () => {
    expect(parseBearer(null)).toEqual({ kind: "none" });
    expect(parseBearer("")).toEqual({ kind: "none" });
    expect(parseBearer("   ")).toEqual({ kind: "none" });
  });
  it("valid bearer → key (case-insensitive scheme)", () => {
    expect(parseBearer(`Bearer ${key}`)).toEqual({ kind: "key", token: key });
    expect(parseBearer(`bearer ${key}`)).toEqual({ kind: "key", token: key });
  });
  it("anything else is invalid, never anonymous", () => {
    expect(parseBearer(`Basic ${key}`)).toEqual({ kind: "invalid" });
    expect(parseBearer("Bearer wd_live_short")).toEqual({ kind: "invalid" });
    expect(parseBearer(`Bearer ${key.toUpperCase()}`)).toEqual({ kind: "invalid" });
    expect(parseBearer(`Bearer ${key} extra`)).toEqual({ kind: "invalid" });
  });
});
