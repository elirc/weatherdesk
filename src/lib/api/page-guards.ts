import "server-only";
import { notFound, redirect } from "next/navigation";
import { AuthzError, getSessionUser, requireOrgMember, type SessionUser } from "@/lib/authz";

/**
 * Page-level guards for session-scoped pages (dashboard/org). Pages render
 * inside <Suspense> (cacheComponents), so these run in the streamed part.
 * Server Actions still call require* themselves — these only gate UI.
 */

export async function pageUser(next: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

export async function pageOrgMember(
  organizationId: string,
  next: string,
  minRole: "member" | "admin" | "owner" = "member",
): Promise<{ user: SessionUser; memberRole: string }> {
  await pageUser(next);
  try {
    return await requireOrgMember(organizationId, minRole);
  } catch (e) {
    if (e instanceof AuthzError) notFound();
    throw e;
  }
}

/** Member roles that may administer the organisation. */
export function isOrgAdmin(memberRole: string): boolean {
  return memberRole === "owner" || memberRole === "admin";
}
