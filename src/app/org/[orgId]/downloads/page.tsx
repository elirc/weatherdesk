import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgPlan } from "@/lib/api/limits";
import { pageOrgMember } from "@/lib/api/page-guards";
import { addDaysIso, lagosToday } from "@/lib/time";
import { listAreas } from "@/server/queries/org";
import { DownloadForm } from "../../_components/client";

/** /org/[orgId]/downloads — CSV / Excel of observed or forecast daily data for custom areas (plan-gated). */
async function DownloadsPageContent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await pageOrgMember(orgId, `/org/${orgId}/downloads`);
  const [plan, areas] = await Promise.all([getOrgPlan(orgId), listAreas(orgId)]);
  const today = lagosToday();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data downloads</CardTitle>
        <CardDescription>
          Daily values per grid cell (~11 km) covering each area, with source and preliminary flags. Observed: NASA POWER
          (final) or model estimates (preliminary). Forecast: latest run, 16 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {plan.limits.downloads ? (
          <DownloadForm
            organizationId={orgId}
            areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            defaultFrom={addDaysIso(today, -90)}
            defaultTo={addDaysIso(today, -1)}
          />
        ) : (
          <p className="text-sm">
            Downloads are not included in {plan.name}.{" "}
            <Link href={`/org/${orgId}/billing`} className="underline underline-offset-4">
              Upgrade
            </Link>{" "}
            to export CSV and Excel.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function DownloadsPage(props: Parameters<typeof DownloadsPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <DownloadsPageContent {...props} />
    </Suspense>
  );
}
