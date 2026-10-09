import { NextResponse, type NextRequest } from "next/server";
import { sanitizeSvg } from "@/components/climate/lib/sanitize-svg";
import { AuthzError, requireEditor } from "@/lib/authz";
import { getStaffReportSvg } from "@/server/queries/staff";

/**
 * GET /staff/reports/[id]/map/[key] — one report map SVG for the staff
 * preview, for ANY report (drafts/unpublished/branded). Editors only; never
 * cached publicly. Same sanitiser + no-script CSP as A4's public route.
 */
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  try {
    await requireEditor();
  } catch (e) {
    if (e instanceof AuthzError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
  const { id, key } = await params;
  if (!SAFE.test(id) || !SAFE.test(key)) return new NextResponse("Not found", { status: 404 });
  const raw = await getStaffReportSvg(id, key);
  const svg = raw ? sanitizeSvg(raw) : null;
  if (!svg) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
