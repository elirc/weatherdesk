import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutButton } from "@/app/dashboard/_components/client";
import { getOrgPlan, parsePlanLimits } from "@/lib/api/limits";
import { isOrgAdmin, pageOrgMember } from "@/lib/api/page-guards";
import { formatKobo } from "@/lib/money";
import { formatLagosDate } from "@/lib/time";
import { listOrgSubscriptions, listPlans } from "@/server/queries/billing";
import { startOrgCheckoutAction } from "../actions";

/** /org/[orgId]/billing — current plan, upgrade via Paystack checkout, subscription history. */
async function OrgBillingPageContent({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const { memberRole } = await pageOrgMember(orgId, `/org/${orgId}/billing`);
  const [sp, plan, plans, history] = await Promise.all([searchParams, getOrgPlan(orgId), listPlans("org"), listOrgSubscriptions(orgId)]);
  const admin = isOrgAdmin(memberRole);
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;

  return (
    <div className="space-y-6">
      {checkout === "success" && (
        <Alert>
          <AlertDescription>Payment confirmed — you are now on {plan.name}.</AlertDescription>
        </Alert>
      )}
      {checkout === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>Payment was not completed{typeof sp.reason === "string" ? `: ${sp.reason}` : ""}.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Current plan: {plan.name}</CardTitle>
          <CardDescription>
            {plan.priceKoboMonthly > 0 ? `${formatKobo(plan.priceKoboMonthly)} / month` : "Free"}
            {plan.currentPeriodEnd ? ` · renews ${formatLagosDate(plan.currentPeriodEnd)}` : ""}
            {plan.status !== "active" ? ` · ${plan.status}` : ""}. Prices are placeholders.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3" data-testid="plans">
        {plans.map((p) => {
          const l = parsePlanLimits(p.limits);
          const current = p.id === plan.id;
          return (
            <Card key={p.id} className={current ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {current && <Badge>Current</Badge>}
                </div>
                <CardDescription>{p.priceKoboMonthly > 0 ? `${formatKobo(p.priceKoboMonthly)} / month` : "Free"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="space-y-1 text-muted-foreground">
                  <li>{l.apiCallsPerDay.toLocaleString("en-NG")} API calls / day</li>
                  <li>{l.customAreas} custom area{l.customAreas === 1 ? "" : "s"}</li>
                  <li>{l.teamMembers} team seat{l.teamMembers === 1 ? "" : "s"}</li>
                  <li>{l.downloads ? "CSV / Excel downloads" : "No downloads"}</li>
                  <li>{l.brandedReports ? "Branded report PDFs" : "No branded reports"}</li>
                </ul>
                {admin && !current && p.priceKoboMonthly > 0 && (
                  <CheckoutButton
                    action={startOrgCheckoutAction}
                    payload={{ organizationId: orgId, planId: p.id }}
                    label={p.priceKoboMonthly > plan.priceKoboMonthly ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                    testId={`checkout-${p.id}`}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Subscription history</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {history.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {s.planName} · <span className="text-muted-foreground">{s.status}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  started {formatLagosDate(s.createdAt)}
                  {s.currentPeriodEnd ? ` · period ends ${formatLagosDate(s.currentPeriodEnd)}` : ""}
                  {s.paystackSubscriptionCode ? ` · ${s.paystackSubscriptionCode}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function OrgBillingPage(props: Parameters<typeof OrgBillingPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <OrgBillingPageContent {...props} />
    </Suspense>
  );
}
