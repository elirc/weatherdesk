import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePlace, type PlaceKind } from "@/app/(public)/place/resolve";
import { HistoryView } from "@/components/history/history-view";
import { ClimateView } from "./climate-view";
import { FarmingView } from "./farming-view";
import { TabSkeleton, type InfoTab } from "./info-header";

/**
 * Shared plumbing for the thin route files under
 * src/app/(public)/place/{state,lga,settlement}/[…]/{climate,history,farming}/page.tsx.
 * Place resolution: A3's resolvePlace (cached). Points have no info routes —
 * A3's tab bar sends them to the containing LGA's tabs.
 *
 * Cache Components (next.config cacheComponents: true): params/searchParams
 * are request data, so they are awaited inside <Suspense>; the data loaders
 * in the views carry "use cache" + cacheLife (climate normals 1 day, farming
 * 1 hour, history/month-so-far "hours") in place of segment `revalidate`,
 * which Next 16 rejects when Cache Components is on.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;
export type InfoPlaceKind = Exclude<PlaceKind, "point">;

const TAB_META: Record<InfoTab, (name: string) => { title: string; description: string }> = {
  climate: (n) => ({
    title: `${n} climate and rainfall normals`,
    description: `Monthly rainfall and temperature normals (1991–2020), typical rainy season dates and this month so far for ${n}.`,
  }),
  history: (n) => ({
    title: `${n} weather history`,
    description: `Daily observed rainfall and temperature for ${n} with chart, table and CSV download.`,
  }),
  farming: (n) => ({
    title: `${n} farming weather`,
    description: `Rain expected this week, dry days ahead and whether the rains have started in ${n}.`,
  }),
};

export async function infoTabMetadata(tab: InfoTab, kind: InfoPlaceKind, key: Promise<string>): Promise<Metadata> {
  const ctx = await resolvePlace(kind, decodeURIComponent(await key));
  if (!ctx) return { title: "Place not found" };
  return { ...TAB_META[tab](ctx.name), alternates: { canonical: `${ctx.tabBasePath ?? ctx.basePath}/${tab}` } };
}

async function Resolved({
  tab,
  kind,
  placeKey,
  searchParams,
}: {
  tab: InfoTab;
  kind: InfoPlaceKind;
  placeKey: Promise<string>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const ctx = await resolvePlace(kind, decodeURIComponent(await placeKey));
  if (!ctx) notFound();
  if (tab === "climate") return <ClimateView place={ctx} />;
  if (tab === "farming") return <FarmingView place={ctx} />;
  const sp = searchParams ? await searchParams : {};
  return <HistoryView place={ctx} searchParams={sp} />;
}

export function InfoTabPage(props: {
  tab: InfoTab;
  kind: InfoPlaceKind;
  placeKey: Promise<string>;
  searchParams?: Promise<RawSearchParams>;
}) {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <Resolved {...props} />
    </Suspense>
  );
}
