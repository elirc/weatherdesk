import Link from "next/link";
import { cacheLife } from "next/cache";
import { listLgasForState, listSettlementsForLga } from "@/server/queries/geo";
import { PlaceHeader } from "../place-header";
import type { PlaceContext } from "../resolve";
import { PlaceTabBar } from "../tab-bar";
import { ForecastView } from "./forecast-view";

/** Forecast-tab page body shared by the state / LGA / settlement / point routes. */
export function PlaceForecastPage({ ctx }: { ctx: PlaceContext }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <PlaceHeader ctx={ctx} />
      <PlaceTabBar ctx={ctx} active="forecast" />
      <ForecastView ctx={ctx} />
      <NearbyPlaces ctx={ctx} />
    </div>
  );
}

/** LGAs of a state / towns of an LGA — plain links for crawlers and slow phones. */
async function NearbyPlaces({ ctx }: { ctx: PlaceContext }) {
  "use cache";
  cacheLife("days");
  if (ctx.kind === "state" && ctx.stateId) {
    const lgas = await listLgasForState(ctx.stateId);
    return (
      <section aria-labelledby="nearby-h" className="space-y-2">
        <h2 id="nearby-h" className="text-lg font-semibold">
          LGAs in {ctx.name} ({lgas.length})
        </h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {lgas.map((l) => (
            <li key={l.id}>
              <Link href={`/place/lga/${l.slug}`} className="hover:underline">
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (ctx.kind === "lga" && ctx.lgaId) {
    const towns = await listSettlementsForLga(ctx.lgaId, 60);
    if (towns.length === 0) return null;
    return (
      <section aria-labelledby="nearby-h" className="space-y-2">
        <h2 id="nearby-h" className="text-lg font-semibold">
          Towns in {ctx.name}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {towns.map((t) => (
            <li key={t.id}>
              <Link href={`/place/settlement/${t.id}`} className="hover:underline">
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}

export function PlaceLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-56 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
