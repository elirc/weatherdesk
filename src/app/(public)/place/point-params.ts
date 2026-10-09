import { z } from "zod";
import { inNigeriaBbox } from "@/lib/geo/zones";

/**
 * Validation for /place/point?lat=&lon= — numbers inside the Nigeria bbox,
 * rounded to 3 dp (~110 m) so caches and URLs stay canonical. Pure.
 */

const coord = z.coerce.number().refine(Number.isFinite, "not a number");

const schema = z
  .object({ lat: coord, lon: coord })
  .refine((p) => inNigeriaBbox(p.lat, p.lon), { message: "outside Nigeria" });

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export type PointParams = { ok: true; lat: number; lon: number } | { ok: false; error: string };

export function parsePointParams(raw: { lat?: unknown; lon?: unknown }): PointParams {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const lat = first(raw.lat);
  const lon = first(raw.lon);
  if (lat === undefined || lon === undefined || lat === "" || lon === "") {
    return { ok: false, error: "Add a latitude and longitude, e.g. ?lat=6.524&lon=3.379." };
  }
  const parsed = schema.safeParse({ lat, lon });
  if (!parsed.success) {
    const outside = parsed.error.issues.some((i) => i.message === "outside Nigeria");
    return {
      ok: false,
      error: outside
        ? "That point is outside Nigeria. WeatherDesk covers Nigeria only."
        : "Latitude and longitude must be numbers.",
    };
  }
  return { ok: true, lat: round3(parsed.data.lat), lon: round3(parsed.data.lon) };
}

/** "6.524° N, 3.379° E" */
export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Point identity used by resolvePlace("point", …): "lat,lon". */
export function pointKey(lat: number, lon: number): string {
  return `${round3(lat)},${round3(lon)}`;
}

export function parsePointKey(key: string): { lat: number; lon: number } | null {
  const [a, b] = key.split(",");
  const r = parsePointParams({ lat: a, lon: b });
  return r.ok ? { lat: r.lat, lon: r.lon } : null;
}
