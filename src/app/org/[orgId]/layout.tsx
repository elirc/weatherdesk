import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getOrgPlan } from "@/lib/api/limits";
import { pageOrgMember } from "@/lib/api/page-guards";
import { getOrg } from "@/server/queries/org";
import { OrgNav } from "../_components/client";

/**
 * Org shell. Rendered inside /org/layout's Suspense, so awaiting params and
 * the session here streams. Guards membership for every page below.
 */
async function OrgLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { memberRole } = await pageOrgMember(orgId, `/org/${orgId}`);
  const [org, plan] = await Promise.all([getOrg(orgId), getOrgPlan(orgId)]);
  if (!org) notFound();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/org" className="hover:underline">
              Organisations
            </Link>{" "}
            /
          </p>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{plan.name}</Badge>
          <Badge variant="outline">you: {memberRole}</Badge>
        </div>
      </div>
      <OrgNav />
      {children}
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function OrgLayout(props: Parameters<typeof OrgLayoutContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <OrgLayoutContent {...props} />
    </Suspense>
  );
}
