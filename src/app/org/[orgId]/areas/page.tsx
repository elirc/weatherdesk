import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionButton } from "@/app/dashboard/_components/client";
import { checkLimit, getOrgPlan } from "@/lib/api/limits";
import { asGeom, outlinePath } from "@/lib/api/outline";
import { isOrgAdmin, pageOrgMember } from "@/lib/api/page-guards";
import { formatLagosDate } from "@/lib/time";
import { lgaBoundaries, listAreas, listLgaOptions } from "@/server/queries/org";
import { LgaSetForm, PolygonForm } from "../../_components/client";
import { deleteAreaAction } from "../actions";

/** /org/[orgId]/areas — custom areas (LGA sets or polygons), plan-limited. */
async function AreasPageContent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { memberRole } = await pageOrgMember(orgId, `/org/${orgId}/areas`);
  const [areas, plan] = await Promise.all([listAreas(orgId), getOrgPlan(orgId)]);
  const admin = isOrgAdmin(memberRole);
  const limit = checkLimit("customAreas", plan.limits, areas.length);
  const allLgaIds = [...new Set(areas.flatMap((a) => a.lgaIds ?? []))];
  const [boundaries, lgaOptions] = await Promise.all([
    lgaBoundaries(allLgaIds),
    admin && limit.ok ? listLgaOptions() : Promise.resolve([]),
  ]);
  const byLga = new Map(boundaries.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Custom areas</h2>
          <span className="text-sm text-muted-foreground">
            {areas.length} of {plan.limits.customAreas} on {plan.name}
          </span>
        </div>
        {areas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No custom areas yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="custom-areas">
            {areas.map((a) => {
              const geoms =
                a.mode === "polygon"
                  ? [asGeom(a.polygonGeojson)].filter((g) => g !== null)
                  : (a.lgaIds ?? []).map((id) => asGeom(byLga.get(id)?.geojson)).filter((g) => g !== null);
              const outline = outlinePath(geoms, 240, 150);
              const lgaNames = (a.lgaIds ?? []).map((id) => byLga.get(id)?.name).filter(Boolean);
              return (
                <li key={a.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">created {formatLagosDate(a.createdAt)}</p>
                    </div>
                    <Badge variant="outline">{a.mode === "lga_set" ? `${lgaNames.length} LGAs` : "polygon"}</Badge>
                  </div>
                  {outline && (
                    <svg viewBox={`0 0 ${outline.width} ${outline.height}`} className="mt-2 h-32 w-full rounded bg-muted/40" role="img" aria-label={`Outline of ${a.name}`}>
                      <path d={outline.d} className="fill-emerald-500/25 stroke-emerald-700" strokeWidth={1} />
                    </svg>
                  )}
                  {lgaNames.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{lgaNames.join(", ")}</p>}
                  {admin && (
                    <div className="mt-2 text-right">
                      <ActionButton
                        action={deleteAreaAction}
                        payload={{ organizationId: orgId, areaId: a.id }}
                        label="Delete"
                        variant="ghost"
                        confirm={`Delete ${a.name}?`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {admin &&
        (limit.ok ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New custom area</CardTitle>
              <CardDescription>Pick LGAs, or paste a GeoJSON polygon for a farm, catchment or service area.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="lga">
                <TabsList>
                  <TabsTrigger value="lga">LGA set</TabsTrigger>
                  <TabsTrigger value="polygon">Polygon</TabsTrigger>
                </TabsList>
                <TabsContent value="lga" className="pt-4">
                  <LgaSetForm organizationId={orgId} lgas={lgaOptions} />
                </TabsContent>
                <TabsContent value="polygon" className="pt-4">
                  <PolygonForm organizationId={orgId} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-lg border p-4 text-sm">
            You&apos;ve used all {limit.limit} custom areas on {plan.name}.{" "}
            <a href={`/org/${orgId}/billing`} className="underline underline-offset-4">
              Upgrade
            </a>{" "}
            for more.
          </p>
        ))}
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function AreasPage(props: Parameters<typeof AreasPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <AreasPageContent {...props} />
    </Suspense>
  );
}
