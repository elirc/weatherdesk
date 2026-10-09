import { NextResponse, type NextRequest } from "next/server";
import { getStorageAdapter } from "@/adapters";
import { AuthzError, requireOrgMember } from "@/lib/authz";
import { getOrgReportPdf } from "@/server/queries/org";

/** GET /org/[orgId]/reports/[reportId]/pdf — a branded (org-private) report PDF. Members only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string; reportId: string }> }) {
  const { orgId, reportId } = await params;
  try {
    await requireOrgMember(orgId);
  } catch (e) {
    if (e instanceof AuthzError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(reportId)) return new NextResponse("Not found", { status: 404 });
  const meta = await getOrgReportPdf(orgId, reportId);
  if (!meta) return new NextResponse("Not found", { status: 404 });
  const file = await getStorageAdapter().get(meta.pdfKey);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.content.byteLength),
      "Content-Disposition": `inline; filename="weatherdesk-${meta.type}-${meta.periodStart}-branded.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
