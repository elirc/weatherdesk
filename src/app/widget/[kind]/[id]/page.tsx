import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { WIDGET_KINDS, type WidgetKind } from "@/components/forecast/embed-snippet";
import { fmt, relativeDayLabel } from "@/components/forecast/format";
import { WeatherIcon } from "@/components/forecast/weather-icon";
import { sourceLabel } from "@/components/weather/provenance";
import { env } from "@/lib/env";
import { ageLabel, lagosToday } from "@/lib/time";
import { daily16 } from "@/server/queries/weather";
import { resolvePlace, type PlaceContext } from "@/app/(public)/place/resolve";

type Props = { params: Promise<{ kind: string; id: string }> };

export const metadata: Metadata = { title: "Forecast widget" };

/** Cache Components needs ≥ 1 static param; everything else renders on demand. */
export async function generateStaticParams() {
  return [{ kind: "state", id: "lagos" }];
}

export default function WidgetPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 w-full max-w-sm animate-pulse rounded-lg bg-muted" />}>
      <WidgetContent params={params} />
    </Suspense>
  );
}

async function WidgetContent({ params }: Props) {
  const { kind, id } = await params;
  if (!(WIDGET_KINDS as string[]).includes(kind)) notFound();
  const ctx = await resolvePlace(kind as WidgetKind, decodeURIComponent(id));
  if (!ctx) notFound();
  return <WidgetCard ctx={ctx} />;
}

async function WidgetCard({ ctx }: { ctx: PlaceContext }) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  const today = lagosToday();
  const days = ctx.gridCellId ? (await daily16(ctx.gridCellId, today)).slice(0, 4) : [];
  const href = `${env.APP_URL.replace(/\/+$/, "")}${ctx.basePath}`;
  const src = days[0];

  return (
    <article className="w-full max-w-sm rounded-lg border bg-background p-3 text-sm shadow-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="truncate text-base font-semibold">{ctx.name}</h1>
        <span className="shrink-0 text-xs text-muted-foreground">{ctx.stateName ?? ""}</span>
      </header>
      {days.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Forecast not available yet.</p>
      ) : (
        <ol className="mt-2 divide-y">
          {days.map((d) => (
            <li key={d.date} className="flex items-center gap-2 py-1.5">
              <span className="w-20 shrink-0 font-medium">{relativeDayLabel(d.date, today)}</span>
              <WeatherIcon code={d.weatherCode} className="size-5 shrink-0 text-sky-600" />
              <span className="tabular-nums">
                {fmt(d.tmaxC, "°C")}
                <span className="text-muted-foreground"> / {fmt(d.tminC, "°C")}</span>
              </span>
              <span className="ml-auto tabular-nums text-blue-700">
                {fmt(d.rainMm, "mm", 1)} · {fmt(d.rainProbPct, "%")}
              </span>
            </li>
          ))}
        </ol>
      )}
      <footer className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <a href={href} target="_blank" rel="noopener" className="font-medium text-foreground underline">
          Full forecast on WeatherDesk →
        </a>
        {src && (
          <p>
            {sourceLabel(src.source)} · updated {ageLabel(src.fetchedAt)}
          </p>
        )}
        <p>Independent service — not affiliated with NiMet. Advisories are not official warnings.</p>
      </footer>
    </article>
  );
}
