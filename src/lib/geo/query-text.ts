/** Pure search-input helpers (DB-free, unit-tested). Used by search.ts. */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_LIMIT = 25;

/** Escape LIKE/ILIKE wildcards in user input. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Punctuation-insensitive match key: lower-case, apostrophes dropped, any
 * other non-alphanumeric run → one space. Mirrors the SQL `norm()` in
 * search.ts. Output contains only [a-z0-9 ], so it is LIKE-safe.
 */
export function matchKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Queries that mean the Federal Capital Territory. */
export const FCT_ALIASES = new Set(["abuja", "fct", "fct abuja", "abuja fct"]);

/** Normalise a raw query: trim, collapse spaces, drop a trailing "state"/"lga", cap length. */
export function normaliseQuery(q: string): string {
  return q
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(state|lga|l\.g\.a\.?)$/i, "")
    .slice(0, 80);
}
