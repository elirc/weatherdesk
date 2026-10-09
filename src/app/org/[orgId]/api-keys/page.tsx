import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/app/dashboard/_components/client";
import { getOrgPlan } from "@/lib/api/limits";
import { isOrgAdmin, pageOrgMember } from "@/lib/api/page-guards";
import { addDaysIso, ageLabel, dateRange, formatLagosDate, lagosToday } from "@/lib/time";
import { listApiKeys, usageByDay, usageByKey } from "@/server/queries/org";
import { CreateKeyForm } from "../../_components/client";
import { revokeApiKeyAction } from "../actions";

/** /org/[orgId]/api-keys — create (plaintext shown once), revoke, 30-day usage sparkline. */
async function ApiKeysPageContent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { memberRole } = await pageOrgMember(orgId, `/org/${orgId}/api-keys`);
  const today = lagosToday();
  const from = addDaysIso(today, -29);
  const [keys, plan, byDay, byKey] = await Promise.all([
    listApiKeys(orgId),
    getOrgPlan(orgId),
    usageByDay(orgId, from, today),
    usageByKey(orgId, from),
  ]);
  const days = dateRange(from, today);
  const series = days.map((d) => byDay.get(d) ?? 0);
  const total = series.reduce((a, b) => a + b, 0);
  const admin = isOrgAdmin(memberRole);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API usage</CardTitle>
          <CardDescription>
            {plan.limits.apiCallsPerDay.toLocaleString("en-NG")} calls/day on {plan.name} · today {(byDay.get(today) ?? 0).toLocaleString("en-NG")} ·
            last 30 days {total.toLocaleString("en-NG")}.{" "}
            <Link href="/api-docs" className="underline underline-offset-4">
              API docs
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Sparkline values={series} limit={plan.limits.apiCallsPerDay} from={from} to={today} />
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a key</CardTitle>
            <CardDescription>Send it as <code>Authorization: Bearer wd_live_…</code>. Keys are stored hashed; we can&apos;t show it again.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateKeyForm organizationId={orgId} />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Keys</h2>
        {keys.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="api-keys">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {k.name} <code className="text-xs text-muted-foreground">{k.prefix}…</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    created {formatLagosDate(k.createdAt)} · {k.lastUsedAt ? `last used ${ageLabel(k.lastUsedAt)}` : "never used"} ·{" "}
                    {(byKey.get(k.id) ?? 0).toLocaleString("en-NG")} calls / 30 d
                  </p>
                </div>
                {k.revokedAt ? (
                  <Badge variant="outline">revoked {formatLagosDate(k.revokedAt)}</Badge>
                ) : (
                  admin && (
                    <ActionButton
                      action={revokeApiKeyAction}
                      payload={{ organizationId: orgId, keyId: k.id }}
                      label="Revoke"
                      variant="ghost"
                      confirm={`Revoke ${k.name}? Requests using it will start failing immediately.`}
                    />
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Server-rendered inline SVG sparkline (no chart lib for 30 points). */
function Sparkline({ values, limit, from, to }: { values: number[]; limit: number; from: string; to: string }) {
  const w = 600;
  const h = 80;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(" ");
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`Daily API calls, ${from} to ${to}, peak ${max}`}>
        <polyline points={`0,${h} ${pts} ${w},${h}`} className="fill-sky-500/15 stroke-none" />
        <polyline points={pts} fill="none" className="stroke-sky-600" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{from}</span>
        <span>
          peak {max.toLocaleString("en-NG")} / limit {limit.toLocaleString("en-NG")}
        </span>
        <span>{to}</span>
      </figcaption>
    </figure>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function ApiKeysPage(props: Parameters<typeof ApiKeysPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <ApiKeysPageContent {...props} />
    </Suspense>
  );
}
