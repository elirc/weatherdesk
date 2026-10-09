import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listStates } from "@/server/queries/geo";
import { PlaceForecastPage, PlaceLoading } from "../../_components/place-page";
import { resolvePlace } from "../../resolve";

type Props = { params: Promise<{ slug: string }> };

/** All 37 states prerendered; data cached 30 min via `use cache` (cacheComponents). */
export async function generateStaticParams() {
  const states = await listStates();
  return states.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await resolvePlace("state", slug);
  if (!ctx) return { title: "Place not found" };
  return {
    title: `${ctx.name} weather forecast`,
    description: `Weather now, 48-hour and 16-day forecast for ${ctx.name}, Nigeria, with rain, temperature, wind and active advisories.`,
    alternates: { canonical: ctx.basePath },
  };
}

export default function StatePage({ params }: Props) {
  return (
    <Suspense fallback={<PlaceLoading />}>
      <StateContent params={params} />
    </Suspense>
  );
}

async function StateContent({ params }: Props) {
  const { slug } = await params;
  const ctx = await resolvePlace("state", slug);
  if (!ctx) notFound();
  return <PlaceForecastPage ctx={ctx} />;
}
