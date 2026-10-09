import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/api/page-guards";
import { ageLabel } from "@/lib/time";
import { listSavedPlaces, MAX_SAVED_PLACES, type SavedPlaceView } from "@/server/queries/account";
import { deletePlaceAction } from "./actions";
import { ActionButton, AlertsToggle, PlacePicker } from "./_components/client";

/** /dashboard — saved places with today's forecast chip (rendered inside the layout's Suspense). */
async function DashboardPageContent() {
  const user = await pageUser("/dashboard");
  const places = await listSavedPlaces(user.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">Your saved places, today&apos;s outlook and advisory alerts.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add a place</CardTitle>
          <CardDescription>
            Up to {MAX_SAVED_PLACES} places. New points are queued for a forecast fetch automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlacePicker />
        </CardContent>
      </Card>
      <section aria-labelledby="saved-heading" className="space-y-3">
        <h2 id="saved-heading" className="text-lg font-semibold">
          Saved places <span className="text-sm font-normal text-muted-foreground">({places.length})</span>
        </h2>
        {places.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing saved yet — search above to add your first place.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="saved-places">
            {places.map((p) => (
              <PlaceCard key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmt(v: number | null, unit: string, digits = 0): string {
  return v == null ? "—" : `${v.toFixed(digits)}${unit}`;
}

function PlaceCard({ p }: { p: SavedPlaceView }) {
  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={p.href} className="block truncate font-medium hover:underline">
            {p.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{p.context ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
          {p.kind === "lga" ? "LGA" : p.kind}
        </Badge>
      </div>
      {p.today ? (
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-900 dark:bg-orange-950 dark:text-orange-200">
              {fmt(p.today.tmaxC, "°")} / {fmt(p.today.tminC, "°")}
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              Rain {fmt(p.today.rainMm, " mm", 1)} · {fmt(p.today.rainProbPct, "%")}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Today · {p.today.source} · updated {ageLabel(p.today.fetchedAt)}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Forecast pending — the worker fetches new places within minutes.</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <AlertsToggle id={p.id} enabled={p.alertsEnabled} />
        <ActionButton
          action={deletePlaceAction}
          payload={{ id: p.id }}
          label="Remove"
          variant="ghost"
          confirm={`Remove ${p.name}?`}
        />
      </div>
    </li>
  );
}

/** Own Suspense boundary: session reads must stream for instant navigations (cacheComponents). */
export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <DashboardPageContent />
    </Suspense>
  );
}
