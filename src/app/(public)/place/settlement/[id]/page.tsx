import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllLgas, listSettlementsForLga, getLgaBySlug } from "@/server/queries/geo";
import { PlaceForecastPage, PlaceLoading } from "../../_components/place-page";
import { resolvePlace } from "../../resolve";

type Props = { params: Promise<{ id: string }> };

/** Settlements render on demand; one prerendered (Cache Components needs ≥ 1 param). */
export async function generateStaticParams() {
  const [first] = await listAllLgas();
  const lga = first ? await getLgaBySlug(first.slug) : null;
  const towns = lga ? await listSettlementsForLga(lga.id, 1) : [];
  return towns.length > 0 ? [{ id: String(towns[0].id) }] : [{ id: "1" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolvePlace("settlement", id);
  if (!ctx) return { title: "Place not found" };
  return {
    title: `${ctx.name} weather forecast`,
    description: `Weather now, 48-hour and 16-day forecast for ${ctx.name} (${ctx.lgaName} LGA, ${ctx.stateName}).`,
    alternates: { canonical: ctx.basePath },
  };
}

export default function SettlementPage({ params }: Props) {
  return (
    <Suspense fallback={<PlaceLoading />}>
      <SettlementContent params={params} />
    </Suspense>
  );
}

async function SettlementContent({ params }: Props) {
  const { id } = await params;
  const ctx = await resolvePlace("settlement", id);
  if (!ctx) notFound();
  return <PlaceForecastPage ctx={ctx} />;
}
