import { Suspense } from "react";
import type { Metadata } from "next";
import { PlaceSearch } from "@/components/search/place-search";
import { JOBS, sendJob } from "@/lib/queue";
import { PlaceForecastPage, PlaceLoading } from "../_components/place-page";
import { parsePointParams, pointKey } from "../point-params";
import { resolvePlace } from "../resolve";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = {
  title: "Weather at your location",
  description: "Forecast for any point in Nigeria — current conditions, 48 hours and 16 days.",
  robots: { index: false },
};

export default function PointPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<PlaceLoading />}>
      <PointContent searchParams={searchParams} />
    </Suspense>
  );
}

const recentActivations = new Map<string, number>();
const ACTIVATION_DEDUPE_MS = 5 * 60 * 1000;

/**
 * Fire-and-forget on-demand cell activation. Never blocks or breaks the
 * page: the queue may be unavailable in dev without a worker.
 */
function requestCellActivation(lat: number, lon: number) {
  // pg-boss singletonKey needs a queue policy, so dedupe repeat renders in-process
  const key = pointKey(lat, lon);
  const now = Date.now();
  const last = recentActivations.get(key);
  if (last && now - last < ACTIVATION_DEDUPE_MS) return;
  recentActivations.set(key, now);
  if (recentActivations.size > 1000) {
    for (const [k, t] of recentActivations) if (now - t >= ACTIVATION_DEDUPE_MS) recentActivations.delete(k);
  }
  try {
    void sendJob(JOBS.cellActivate, { lat, lon }, { singletonKey: `cell:${pointKey(lat, lon)}` }).catch(
      () => undefined,
    );
  } catch {
    // queue unavailable — page still renders nearest data
  }
}

async function PointContent({ searchParams }: Props) {
  const sp = await searchParams;
  const p = parsePointParams({ lat: sp.lat, lon: sp.lon });
  if (!p.ok) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <h1 className="text-2xl font-semibold">Weather at a point</h1>
        <p className="text-muted-foreground">{p.error}</p>
        <PlaceSearch />
      </div>
    );
  }
  const ctx = await resolvePlace("point", pointKey(p.lat, p.lon));
  if (!ctx) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <h1 className="text-2xl font-semibold">Weather at a point</h1>
        <p className="text-muted-foreground">We could not resolve that location. Try searching instead.</p>
        <PlaceSearch />
      </div>
    );
  }
  if (ctx.needsActivation) requestCellActivation(ctx.lat, ctx.lon);
  return <PlaceForecastPage ctx={ctx} />;
}
