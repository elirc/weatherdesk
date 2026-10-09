/**
 * Public API v1 response envelope (pure).
 * Success: { data, meta: { source, fetchedAt, attribution } }
 * Error:   { error: { code, message } }
 */

export const API_ATTRIBUTION =
  "Weather data: Open-Meteo (CC BY 4.0), NASA POWER; boundaries: geoBoundaries / GRID3; " +
  "map data © OpenStreetMap contributors. Independent service — not affiliated with NiMet. " +
  "Advisories are not official warnings.";

export type ApiMeta = {
  source: string;
  fetchedAt: string | null;
  attribution: string;
  [k: string]: unknown;
};

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "quota_exceeded"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  quota_exceeded: 429,
  internal: 500,
};

export function envelope<T>(
  data: T,
  meta: { source: string; fetchedAt: Date | string | null; [k: string]: unknown },
): { data: T; meta: ApiMeta } {
  const fetchedAt = meta.fetchedAt instanceof Date ? meta.fetchedAt.toISOString() : meta.fetchedAt;
  return { data, meta: { ...meta, fetchedAt, attribution: API_ATTRIBUTION } };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/** Thrown inside endpoint handlers to short-circuit with a typed error. */
export class ApiHttpError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

/** Zod issue list → one readable line. */
export function zodMessage(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.map(String).join(".")}: ${i.message}` : i.message))
    .join("; ");
}
