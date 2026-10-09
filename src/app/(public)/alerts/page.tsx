import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { CloudRain, Sun, Thermometer, Wind } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertsMap, SEVERITY_FILL } from "@/components/climate/alerts-map";
import { EmptyState } from "@/components/climate/info-header";
import { formatLagos } from "@/lib/time";
import { listActiveAlerts, listNotices, type PublicAlert } from "@/server/queries/alerts";

export const metadata: Metadata = {
  title: "Active weather advisories",
  description:
    "Automatic heavy rain, heat, wind and dry-spell advisories for Nigerian LGAs. Independent service — not official NiMet warnings.",
  alternates: { canonical: "/alerts" },
};

const TYPE_META: Record<PublicAlert["type"], { label: string; Icon: typeof CloudRain }> = {
  heavy_rain: { label: "Heavy rain", Icon: CloudRain },
  heat: { label: "Heat", Icon: Thermometer },
  wind: { label: "Strong wind", Icon: Wind },
  dry_spell: { label: "Dry spell", Icon: Sun },
};

/** Cached ~5 minutes (replaces segment revalidate = 300 under Cache Components). */
async function loadAlertsPage() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const now = new Date();
  const [alerts, notices] = await Promise.all([listActiveAlerts(now), listNotices(["global", "alerts"], now)]);
  return { alerts, notices, generatedAt: now };
}

export default async function AlertsPage() {
  const { alerts, notices, generatedAt } = await loadAlertsPage();

  const byState = new Map<string, PublicAlert[]>();
  for (const a of alerts) {
    const list = byState.get(a.stateName);
    if (list) list.push(a);
    else byState.set(a.stateName, [a]);
  }
  const worstByLga = new Map<number, "moderate" | "high">();
  for (const a of alerts) {
    if (a.severity === "high" || !worstByLga.has(a.lgaId)) worstByLga.set(a.lgaId, a.severity);
  }
  const lgaCount = worstByLga.size;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Active weather advisories</h1>
        <p className="text-sm text-muted-foreground">
          {alerts.length === 0
            ? "No active advisories."
            : `${alerts.length} active advisor${alerts.length === 1 ? "y" : "ies"} in ${lgaCount} LGA${lgaCount === 1 ? "" : "s"} across ${byState.size} state${byState.size === 1 ? "" : "s"}.`}{" "}
          Updated {formatLagos(generatedAt)} WAT.
        </p>
      </header>

      <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTitle>Automatic advisories — not official warnings</AlertTitle>
        <AlertDescription className="text-amber-900 dark:text-amber-200">
          WeatherDesk is independent and not affiliated with NiMet. These advisories are generated
          automatically from forecast model data when thresholds are crossed (see{" "}
          <Link href="/about#alerts" className="underline">
            thresholds
          </Link>
          ). For official warnings, follow NiMet and your state emergency management agency.
        </AlertDescription>
      </Alert>

      {notices.map((n) => (
        <Alert key={n.id}>
          <AlertTitle>{n.title}</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{n.body}</AlertDescription>
        </Alert>
      ))}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="map-title" className="rounded-lg border p-4">
          <h2 id="map-title" className="mb-2 font-semibold">
            Map
          </h2>
          <AlertsMap lgas={[...worstByLga].map(([lgaId, severity]) => ({ lgaId, severity }))} />
        </section>

        <section aria-labelledby="list-title" className="space-y-4">
          <h2 id="list-title" className="font-semibold">
            By state
          </h2>
          {alerts.length === 0 ? (
            <EmptyState title="No active advisories.">
              Nothing has crossed the heavy rain, heat, wind or dry-spell thresholds for the coming
              days. Check back later — advisories update with every forecast run.
            </EmptyState>
          ) : (
            [...byState].map(([state, list]) => (
              <div key={state} className="rounded-lg border">
                <h3 className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">
                  <Link href={`/place/state/${list[0].stateSlug}`} className="hover:underline">
                    {state}
                  </Link>{" "}
                  <span className="text-muted-foreground">({list.length})</span>
                </h3>
                <ul className="divide-y">
                  {list.map((a) => {
                    const { label, Icon } = TYPE_META[a.type];
                    return (
                      <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                        <Icon
                          className="mt-0.5 size-5 shrink-0"
                          style={{ color: SEVERITY_FILL[a.severity] }}
                          aria-hidden
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">
                            {label} ·{" "}
                            <Link href={`/place/lga/${a.lgaSlug}`} className="underline">
                              {a.lgaName}
                            </Link>{" "}
                            <span
                              className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-normal text-white"
                              style={{ background: SEVERITY_FILL[a.severity] }}
                            >
                              {a.severity}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatLagos(a.validFrom)} – {formatLagos(a.validTo)} WAT
                          </p>
                          <p>{a.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Source: WeatherDesk automatic rules applied to the Open-Meteo forecast.
      </p>
    </div>
  );
}
