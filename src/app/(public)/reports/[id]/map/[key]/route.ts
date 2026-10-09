import { NextResponse, type NextRequest } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { sanitizeSvg } from "@/components/climate/lib/sanitize-svg";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { getPublicReportSvg } from "@/server/queries/reports";

/**
 * GET /reports/[id]/map/[key]?v=<updatedAt ms> — one report map as
 * image/svg+xml, rendered by the report page via <img loading="lazy">
 * (keeps ~280 KB SVGs out of the page HTML + RSC payload).
 *
 * Visibility: same rule as the PDF route (non-draft, published,
 * organization_id IS NULL — enforced in the query); 404 otherwise.
 * Rate-limited per IP. Markup is passed through sanitizeSvg and served with
 * a no-script CSP (defence in depth if the URL is opened directly).
 *
 * Caching: data cached server-side and tagged `report:<id>` / `reports`
 * (same tags as the report page, so a republish revalidateTag clears both).
 * The page links with ?v=<reports.updated_at>; when `v` matches the current
 * version the response is `immutable` for a year (a republish changes the
 * URL), otherwise it gets a short max-age.
 */

async function loadMap(id: string, key: string): Promise<{ svg: string; version: string } | null> {
  "use cache";
  cacheLife("days");
  cacheTag(`report:${id}`, "reports");
  const r = await getPublicReportSvg(id, key);
  if (!r) return null;
  const svg = sanitizeSvg(r.svg);
  if (!svg) return null;
  return { svg, version: String(r.updatedAt.getTime()) };
}

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // maps load 2–3 per page view, so allow a few times the anonymous public limit
  const rl = rateLimit(`public:${ip}:report-map`, RATE_LIMITS.publicApiAnon.limit * 3, RATE_LIMITS.publicApiAnon.windowMs);
  if (!rl.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }
  const { id, key } = await params;
  if (!SAFE.test(id) || !SAFE.test(key)) return new NextResponse("Not found", { status: 404 });
  const map = await loadMap(id, key);
  if (!map) return new NextResponse("Not found", { status: 404 });

  const etag = `"${id}-${key}-${map.version}"`;
  const versioned = req.nextUrl.searchParams.get("v") === map.version;
  const headers = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300, s-maxage=3600",
    ETag: etag,
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(map.svg, { status: 200, headers });
}
