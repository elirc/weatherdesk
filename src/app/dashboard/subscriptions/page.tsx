import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/api/page-guards";
import { formatLagosDate } from "@/lib/time";
import { listReportSubscriptions } from "@/server/queries/account";
import { listStates } from "@/server/queries/geo";
import { unsubscribeReportAction } from "../actions";
import { ActionButton, ReportSubscribeForm } from "../_components/client";

/** /dashboard/subscriptions — weekly/monthly report emails for Nigeria or any state. */
async function SubscriptionsPageContent() {
  const user = await pageUser("/dashboard/subscriptions");
  const [subs, states] = await Promise.all([listReportSubscriptions(user.id), listStates()]);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Report emails</CardTitle>
          <CardDescription>
            Weekly reports publish Mondays 06:00 Lagos; monthly reports on the 2nd (preliminary) and 10th (final). Free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportSubscribeForm states={states.map((s) => ({ id: s.id, name: s.name }))} />
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your subscriptions</h2>
        {subs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No report subscriptions yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="report-subscriptions">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium capitalize">
                    {s.reportType} · {s.scopeName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    by {s.channel} · since {formatLagosDate(s.createdAt)}
                  </p>
                </div>
                <ActionButton action={unsubscribeReportAction} payload={{ id: s.id }} label="Unsubscribe" variant="ghost" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Own Suspense boundary: session reads must stream for instant navigations (cacheComponents). */
export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <SubscriptionsPageContent />
    </Suspense>
  );
}
