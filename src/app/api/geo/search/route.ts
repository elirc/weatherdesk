import { z } from "zod";
import { SEARCH_MAX_LIMIT } from "@/lib/geo/search";
import { maybeCleanup, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchPlaces } from "@/server/queries/geo";

/**
 * GET /api/geo/search?q=kadun&limit=8 — place search (states, LGAs,
 * settlements). Rate-limited per IP with RATE_LIMITS.search.
 */

const querySchema = z.object({
  q: z.string().trim().max(80),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(8),
});

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request) {
  maybeCleanup();
  const ip = clientIp(request);
  const rl = rateLimit(`search:${ip}`, RATE_LIMITS.search.limit, RATE_LIMITS.search.windowMs);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many searches — please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "invalid query" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const hits = await searchPlaces(parsed.data.q, parsed.data.limit);
  const results = hits.map((h) => ({
    kind: h.kind,
    id: h.id,
    name: h.name,
    context: h.context,
    href: placeHref(h.kind, h.slug, h.id),
  }));
  return Response.json(
    { results },
    { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) } },
  );
}

function placeHref(kind: "state" | "lga" | "settlement", slug: string | null, id: number): string {
  if (kind === "settlement") return `/place/settlement/${id}`;
  return `/place/${kind}/${slug}`;
}
