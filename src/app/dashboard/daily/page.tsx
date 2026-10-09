import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserAddon } from "@/lib/api/limits";
import { pageUser } from "@/lib/api/page-guards";
import { formatKobo } from "@/lib/money";
import { formatLagosDate } from "@/lib/time";
import { getUserPhone, listDailySends, listSavedPlaces } from "@/server/queries/account";
import { getPlan } from "@/server/queries/billing";
import { cancelAddonAction, deleteDailySendAction, startSmsCheckoutAction, toggleDailySendAction } from "../actions";
import { ActionButton, CheckoutButton, DailySendForm } from "../_components/client";

/** /dashboard/daily — paid personal add-on: daily forecast by SMS / WhatsApp. */
async function DailyPageContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await pageUser("/dashboard/daily");
  const [sp, addon, plan, places, sends, phone] = await Promise.all([
    searchParams,
    getUserAddon(user.id, "sms_daily"),
    getPlan("sms_daily"),
    listSavedPlaces(user.id),
    listDailySends(user.id),
    getUserPhone(user.id),
  ]);
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;
  return (
    <div className="space-y-6">
      {checkout === "success" && (
        <Alert>
          <AlertDescription>Payment confirmed — your daily forecast add-on is active.</AlertDescription>
        </Alert>
      )}
      {checkout === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>Payment was not completed{typeof sp.reason === "string" ? `: ${sp.reason}` : ""}.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Daily forecast by SMS / WhatsApp</CardTitle>
            {addon ? <Badge>Active</Badge> : <Badge variant="outline">Not subscribed</Badge>}
          </div>
          <CardDescription>
            Today&apos;s outlook for one saved place, every morning at the time you choose.{" "}
            {plan ? `${formatKobo(plan.priceKoboMonthly)} / month (placeholder price).` : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {addon ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Renews {addon.currentPeriodEnd ? formatLagosDate(addon.currentPeriodEnd) : "monthly"} · status {addon.status}
              </span>
              <ActionButton
                action={cancelAddonAction}
                payload={{ id: addon.id }}
                label="Cancel add-on"
                variant="ghost"
                confirm="Cancel the daily forecast add-on? Scheduled sends stop immediately."
              />
            </div>
          ) : (
            <CheckoutButton action={startSmsCheckoutAction} label="Subscribe with Paystack" testId="sms-checkout" />
          )}
          {!phone.verified && (
            <p className="text-sm text-muted-foreground">
              Tip:{" "}
              <Link href="/verify-phone?next=/dashboard/daily" className="underline underline-offset-4">
                verify your phone number
              </Link>{" "}
              to prefill it here.
            </p>
          )}
        </CardContent>
      </Card>

      {addon && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <DailySendForm
              places={places.map((p) => ({ id: p.id, name: p.name }))}
              defaultPhone={phone.verified && phone.phone ? phone.phone : ""}
            />
          </CardContent>
        </Card>
      )}

      {sends.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Scheduled sends</h2>
          <ul className="divide-y rounded-lg border">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {s.placeName ?? "Removed place"} · {s.sendTimeLocal.slice(0, 5)} Lagos
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.channel === "whatsapp" ? "WhatsApp" : "SMS"} to {s.phone} · {s.active ? "active" : "paused"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ActionButton
                    action={toggleDailySendAction}
                    payload={{ id: s.id, active: !s.active }}
                    label={s.active ? "Pause" : "Resume"}
                  />
                  <ActionButton action={deleteDailySendAction} payload={{ id: s.id }} label="Delete" variant="ghost" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function DailyPage(props: Parameters<typeof DailyPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <DailyPageContent {...props} />
    </Suspense>
  );
}
