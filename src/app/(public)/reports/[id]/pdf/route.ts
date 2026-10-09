import { NextResponse, type NextRequest } from "next/server";
import { getStorageAdapter } from "@/adapters";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { getPublicReportPdfKey } from "@/server/queries/reports";

/**
 * GET /reports/[id]/pdf — streams a PUBLIC report's PDF from the storage
 * adapter. Public resource (no auth): only non-draft, published,
 * non-org reports resolve (enforced in the query). 404-safe for unknown
 * ids, drafts, org copies, missing pdf_key and missing storage objects.
 * Rate-limited per IP like other public endpoints.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`public:${ip}:report-pdf`, RATE_LIMITS.publicApiAnon.limit, RATE_LIMITS.publicApiAnon.windowMs);
  if (!rl.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const meta = await getPublicReportPdfKey(id);
  if (!meta) return new NextResponse("Not found", { status: 404 });
  const file = await getStorageAdapter().get(meta.pdfKey);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const filename = `weatherdesk-${meta.type}-${meta.periodStart}.pdf`;
  return new NextResponse(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.content.byteLength),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
