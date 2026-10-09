import { z } from "zod";
import { NIGERIA_BBOX } from "@/lib/geo/zones";

/**
 * Zod schemas for public API v1 query params (pure). Route handlers parse
 * `Object.fromEntries(url.searchParams)` through these.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "invalid date");

/** LGA code (geoBoundaries shapeID) or LGA slug. */
const lgaRef = z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9-]+$/, "invalid lga");
/** ISO 3166-2 state code, e.g. NG-LA. */
const stateCode = z
  .string()
  .trim()
  .regex(/^NG-[A-Z]{2}$/i, "expected an ISO 3166-2 code like NG-LA")
  .transform((s) => s.toUpperCase());

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

export const forecastParams = z
  .object({
    lat: z.coerce.number().min(NIGERIA_BBOX.minLat).max(NIGERIA_BBOX.maxLat).optional(),
    lon: z.coerce.number().min(NIGERIA_BBOX.minLon).max(NIGERIA_BBOX.maxLon).optional(),
    lga: lgaRef.optional(),
    hourly: boolish.optional().default(false),
  })
  .superRefine((v, ctx) => {
    const hasPoint = v.lat !== undefined || v.lon !== undefined;
    if (hasPoint && (v.lat === undefined || v.lon === undefined)) {
      ctx.addIssue({ code: "custom", message: "lat and lon must be given together" });
    }
    if (hasPoint && v.lga) ctx.addIssue({ code: "custom", message: "give either lat/lon or lga, not both" });
    if (!hasPoint && !v.lga) ctx.addIssue({ code: "custom", message: "lat/lon or lga is required" });
  });

export const HISTORY_MAX_DAYS = 366;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const historyParams = z
  .object({ lga: lgaRef, from: isoDate, to: isoDate })
  .superRefine((v, ctx) => {
    const span = daysBetween(v.from, v.to);
    if (span < 0) ctx.addIssue({ code: "custom", path: ["to"], message: "to must be on or after from" });
    else if (span + 1 > HISTORY_MAX_DAYS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `at most ${HISTORY_MAX_DAYS} days (1 year) per request` });
    }
  });

export const normalsParams = z.object({ lga: lgaRef });

export const alertsParams = z
  .object({
    state: stateCode.optional(),
    lga: lgaRef.optional(),
    active: boolish.optional().default(true),
  })
  .refine((v) => !(v.state && v.lga), { message: "give either state or lga, not both" });

export const reportsParams = z.object({
  type: z.enum(["weekly", "monthly"]).optional(),
  /** 'national' or a state code (NG-KD) */
  scope: z
    .union([z.literal("national"), stateCode])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** URLSearchParams → plain object (last value wins; empty strings dropped). */
export function searchParamsObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp) if (v !== "") out[k] = v;
  return out;
}
