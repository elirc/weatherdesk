import { NextResponse, type NextRequest } from "next/server";
import { getStorageAdapter } from "@/adapters";
import { AuthzError, requireOrgMember } from "@/lib/authz";
import { getOrg } from "@/server/queries/org";

/** GET /org/[orgId]/logo — the org's uploaded logo (members only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    await requireOrgMember(orgId);
  } catch (e) {
    if (e instanceof AuthzError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
  const org = await getOrg(orgId);
  if (!org?.logo || /^https?:/i.test(org.logo)) return new NextResponse("Not found", { status: 404 });
  const file = await getStorageAdapter().get(org.logo);
  if (!file || !/^image\/(png|jpeg)$/.test(file.contentType)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.content), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
