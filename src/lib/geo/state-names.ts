import { STATE_CODES, STATE_ZONES, type Zone } from "./zones";

/**
 * Boundary datasets name some states differently from the canonical keys in
 * zones.ts. geoBoundaries/GRID3 ADM1 uses "Abuja Federal Capital Territory";
 * other sources use "FCT", "Abuja", "Federal Capital Territory (FCT)", or
 * "Nassarawa". normaliseStateName maps every variant onto the canonical key.
 */
const ALIASES: Record<string, string> = {
  "abuja federal capital territory": "Federal Capital Territory",
  "federal capital territory": "Federal Capital Territory",
  "federal capital territory (fct)": "Federal Capital Territory",
  "fct": "Federal Capital Territory",
  "fct abuja": "Federal Capital Territory",
  "abuja": "Federal Capital Territory",
  "nassarawa": "Nasarawa",
  "akwa-ibom": "Akwa Ibom",
  "akwaibom": "Akwa Ibom",
  "cross-river": "Cross River",
  "crossriver": "Cross River",
};

const CANONICAL_BY_LOWER = new Map(
  Object.keys(STATE_ZONES).map((k) => [k.toLowerCase(), k] as const),
);

/** Canonical state name (a key of STATE_ZONES / STATE_CODES), or null if unknown. */
export function normaliseStateName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/\s+state$/i, "")
    .replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();
  return ALIASES[lower] ?? CANONICAL_BY_LOWER.get(lower) ?? null;
}

export type StateMeta = { name: string; code: string; zone: Zone };

/** Zone + ISO code for a raw state name; throws for an unknown state. */
export function stateMeta(raw: string): StateMeta {
  const name = normaliseStateName(raw);
  if (!name) throw new Error(`Unknown Nigerian state name: "${raw}"`);
  const zone = STATE_ZONES[name];
  const code = STATE_CODES[name];
  if (!zone || !code) throw new Error(`State "${name}" missing from STATE_ZONES/STATE_CODES`);
  return { name, code, zone };
}
