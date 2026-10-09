import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/api/page-guards";
import { listUserOrgs } from "@/server/queries/org";
import { CreateOrgForm } from "./_components/client";

/** /org — your organisations + create a new one (Better Auth organization plugin). */
async function OrgIndexPageContent() {
  const user = await pageUser("/org");
  const orgs = await listUserOrgs(user.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organisations</h1>
        <p className="text-sm text-muted-foreground">
          Teams get custom areas, branded reports, data downloads and API keys.{" "}
          <Link href="/dashboard" className="underline underline-offset-4">
            Back to my places
          </Link>
        </p>
      </div>
      {orgs.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="org-list">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/org/${o.id}`} className="block rounded-lg border p-4 hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{o.name}</span>
                  <Badge variant="outline">{o.role}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">/{o.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Create an organisation</CardTitle>
          <CardDescription>Starts on the Free plan (1 custom area, 100 API calls/day). You become the owner.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}

/** Own Suspense boundary: session reads must stream for instant navigations (cacheComponents). */
export default function OrgIndexPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <OrgIndexPageContent />
    </Suspense>
  );
}
