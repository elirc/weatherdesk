import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllLgas } from "@/server/queries/geo";
import { PlaceForecastPage, PlaceLoading } from "../../_components/place-page";
import { resolvePlace } from "../../resolve";

type Props = { params: Promise<{ slug: string }> };

/**
 * LGAs render on demand (ISR via cacheComponents; data cached 30 min).
 * Cache Components requires at least one static param, so prerender one.
 */
export async function generateStaticParams() {
  const lgas = await listAllLgas();
  return lgas.slice(0, 1).map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await resolvePlace("lga", slug);
  if (!ctx) return { title: "Place not found" };
  return {
    title: `${ctx.name}, ${ctx.stateName} weather forecast`,
    description: `Weather now, 48-hour and 16-day forecast for ${ctx.name} LGA, ${ctx.stateName}, with rain, temperature, wind and active advisories.`,
    alternates: { canonical: ctx.basePath },
  };
}

export default function LgaPage({ params }: Props) {
  return (
    <Suspense fallback={<PlaceLoading />}>
      <LgaContent params={params} />
    </Suspense>
  );
}

async function LgaContent({ params }: Props) {
  const { slug } = await params;
  const ctx = await resolvePlace("lga", slug);
  if (!ctx) notFound();
  return <PlaceForecastPage ctx={ctx} />;
}
