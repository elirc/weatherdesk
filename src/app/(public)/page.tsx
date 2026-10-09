import Link from "next/link";
import { cacheLife } from "next/cache";
import { CloudRain, Thermometer, TriangleAlert } from "lucide-react";
import { NoticeBanner } from "@/components/forecast/notice-banner";
import { fmt } from "@/components/forecast/format";
import { LgaMapLazy } from "@/components/map/lga-map-lazy";
import { LocateButton } from "@/components/search/locate-button";
import { PlaceSearch } from "@/components/search/place-search";
import { DataAge } from "@/components/weather/provenance";
import { formatLagosDate, lagosMidnightUtc, lagosToday } from "@/lib/time";
import { activeAlertCount, activeNotices, topMovers, type Mover } from "@/server/queries/weather";

/**
 * Home: national LGA map + search + alerts banner + top movers.
 * Cached 10 min (`use cache` — cacheComponents replaces `revalidate = 600`).
 */
export default async function HomePage() {
  "use cache";
  cacheLife({ stale: 120, revalidate: 600, expire: 86400 });

  const today = lagosToday();
  const [notices, alertCount, movers] = await Promise.all([
    activeNotices(["global", "home"]),
    activeAlertCount(),
    topMovers(today),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <NoticeBanner notices={notices.map(({ id, title, body }) => ({ id, title, body }))} />

      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Weather for all of Nigeria</h1>
        <p className="text-sm text-muted-foreground">
          Forecasts for every state, LGA and town · {formatLagosDate(lagosMidnightUtc(today))}
        </p>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-start" aria-label="Find a place">
        <PlaceSearch />
        <LocateButton />
      </section>

      {alertCount.alerts > 0 ? (
        <Link
          href="/alerts"
          className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <span>
            <strong>
              {alertCount.alerts} active {alertCount.alerts === 1 ? "advisory" : "advisories"}
            </strong>{" "}
            across {alertCount.lgas} {alertCount.lgas === 1 ? "LGA" : "LGAs"} — automatic advisories, not
            official warnings. See all →
          </span>
        </Link>
      ) : (
        <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          No active weather advisories right now.
        </p>
      )}

      <section aria-label="National map">
        <LgaMapLazy styleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Top movers today">
        <MoverList
          title="Wettest LGAs today"
          icon={<CloudRain className="size-4 text-blue-600" aria-hidden />}
          movers={movers.wettest}
          unit="mm"
          decimals={1}
        />
        <MoverList
          title="Hottest LGAs today"
          icon={<Thermometer className="size-4 text-orange-600" aria-hidden />}
          movers={movers.hottest}
          unit="°C"
          decimals={1}
        />
      </section>
    </div>
  );
}

function MoverList({
  title,
  icon,
  movers,
  unit,
  decimals,
}: {
  title: string;
  icon: React.ReactNode;
  movers: Mover[];
  unit: string;
  decimals: number;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </h2>
      {movers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No forecast data yet.</p>
      ) : (
        <ol className="mt-2 space-y-1.5 text-sm">
          {movers.map((m, i) => (
            <li key={m.lgaId} className="flex items-baseline justify-between gap-2">
              <Link href={`/place/lga/${m.lgaSlug}`} className="min-w-0 truncate hover:underline">
                {i + 1}. {m.lgaName} <span className="text-muted-foreground">· {m.stateName}</span>
              </Link>
              <span className="shrink-0 font-medium tabular-nums">{fmt(m.value, unit, decimals)}</span>
            </li>
          ))}
        </ol>
      )}
      {movers[0] && (
        <p className="mt-2">
          <DataAge source={movers[0].source} fetchedAt={movers[0].fetchedAt} />
        </p>
      )}
    </div>
  );
}
