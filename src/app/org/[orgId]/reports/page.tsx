import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgPlan } from "@/lib/api/limits";
import { isOrgAdmin, pageOrgMember } from "@/lib/api/page-guards";
import { formatLagos } from "@/lib/time";
import { getOrg, listAreas, listOrgReports } from "@/server/queries/org";
import { BrandingForm, GenerateReportForm } from "../../_components/client";

/** /org/[orgId]/reports — branding (logo + title) and the org's branded report PDFs. */
async function OrgReportsPageContent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { memberRole } = await pageOrgMember(orgId, `/org/${orgId}/reports`);
  const [org, plan, reports, areas] = await Promise.all([getOrg(orgId), getOrgPlan(orgId), listOrgReports(orgId), listAreas(orgId)]);
  const admin = isOrgAdmin(memberRole);
  const entitled = plan.limits.brandedReports;
  return (
    <div className="space-y-6">
      {!entitled && (
        <p className="rounded-lg border p-4 text-sm">
          Branded reports are part of the paid plans.{" "}
          <Link href={`/org/${orgId}/billing`} className="underline underline-offset-4">
            Upgrade
          </Link>{" "}
          to put your logo and title on weekly/monthly PDFs.
        </p>
      )}
      {admin && entitled && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>Used on every PDF generated for {org?.name}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {org?.logo && (
                // eslint-disable-next-line @next/next/no-img-element -- small private logo streamed from storage
                <img src={`/org/${orgId}/logo`} alt={`${org.name} logo`} className="h-10 w-auto rounded border bg-white p-1" />
              )}
              <BrandingForm organizationId={orgId} brandTitle={org?.brandTitle ?? null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate a branded report</CardTitle>
              <CardDescription>
                Weekly = last full Mon–Sun week; monthly = previous month (preliminary). Scheduled reports for your areas are
                also produced automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GenerateReportForm organizationId={orgId} areas={areas.map((a) => ({ id: a.id, name: a.name }))} />
            </CardContent>
          </Card>
        </div>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Branded reports</h2>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No branded reports yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="org-reports">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium capitalize">
                    {r.type} · {r.scopeType === "custom_area" ? (r.areaName ?? "custom area") : r.scopeKey === "national" ? "Nigeria" : r.scopeKey}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.periodStart} → {r.periodEnd} · updated {formatLagos(r.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "final" ? "default" : "outline"}>{r.status}</Badge>
                  {r.pdfKey ? (
                    <a href={`/org/${orgId}/reports/${r.id}/pdf`} className="text-sm underline underline-offset-4">
                      PDF
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">PDF rendering…</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function OrgReportsPage(props: Parameters<typeof OrgReportsPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <OrgReportsPageContent {...props} />
    </Suspense>
  );
}
