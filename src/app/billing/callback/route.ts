import { NextResponse, type NextRequest } from "next/server";
import { finalizeCheckout } from "@/lib/api/checkout";
import { REFERENCE_PATTERN } from "@/lib/api/paystack";
import { getSessionUser, requireOrgMember, AuthzError } from "@/lib/authz";
import { getSubscription } from "@/server/queries/billing";

/**
 * GET /billing/callback?reference=… (Paystack redirects here after checkout;
 * the mock checkout page does the same). Authz: signed-in user who owns the
 * pending subscription (personal) or is an admin of its organisation.
 * Verifies with Paystack, activates the subscription row, then redirects to
 * the relevant billing screen with ?checkout=success|failed.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  const user = await getSessionUser();
  if (!user) {
    const next = `/billing/callback?reference=${encodeURIComponent(reference)}`;
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, url));
  }
  if (!REFERENCE_PATTERN.test(reference)) return NextResponse.redirect(new URL("/dashboard?checkout=invalid", url));

  const sub = await getSubscription(reference);
  if (!sub) return NextResponse.redirect(new URL("/dashboard?checkout=invalid", url));
  const back = sub.organizationId ? `/org/${sub.organizationId}/billing` : "/dashboard/daily";
  try {
    if (sub.organizationId) await requireOrgMember(sub.organizationId, "admin");
    else if (sub.userId !== user.id) throw new AuthzError("Not your checkout");
  } catch (e) {
    if (e instanceof AuthzError) return NextResponse.redirect(new URL("/dashboard?checkout=forbidden", url));
    throw e;
  }

  const res = await finalizeCheckout(reference);
  const status = res.ok ? "success" : "failed";
  const target = new URL(back, url);
  target.searchParams.set("checkout", status);
  if (!res.ok) target.searchParams.set("reason", res.error);
  return NextResponse.redirect(target);
}
