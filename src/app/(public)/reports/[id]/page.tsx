import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDayMonth } from "@/components/climate/lib/doy";
import { formatAnomalyC } from "@/components/climate/lib/month-so-far";
import { BandChip, ReportMap, StatusBadge } from "@/components/climate/report-svg";
import { formatLagosDate } from "@/lib/time";
import { getPublicReport } from "@/server/queries/reports";
import type { ReportContent } from "@/reports/content-types";

type Props = { params: Promise<{ id: string }> };

/** Cached; tagged `report:<id>` so staff publishing can revalidateTag it. */
async function loadReport(id: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  cacheTag(`report:${id}`, "reports");
  return getPublicReport(id);
}

const TYPE_LABEL = { weekly: "Weekly", monthly: "Monthly" } as const;
const ALERT_LABEL: Record<string, string> = {
  heavy_rain: "Heavy rain",
  heat: "Heat",
  wind: "Strong wind",
  dry_spell: "Dry spell",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await loadReport(id);
  if (!r) return { title: "Report not found" };
  const scope = r.content?.scopeLabel ?? (r.scopeType === "national" ? "Nigeria" : r.stateName ?? "");
  return {
    title: `${TYPE_LABEL[r.type]} weather report: ${scope}, ${r.periodLabel ?? r.periodStart}`,
    description: r.headline ?? undefined,
    alternates: { canonical: `/reports/${r.id}` },
  };
}

export default function ReportPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-4xl animate-pulse rounded-lg bg-muted px-4 py-6" />}>
      <ReportBody params={params} />
    </Suspense>
  );
}

const n1 = (v: number | null | undefined, unit: string) => (v == null ? "—" : `${v.toFixed(1)} ${unit}`);

async function ReportBody({ params }: Props) {
  const { id } = await params;
  const r = await loadReport(id);
  if (!r) notFound();
  const c: Partial<Omit<ReportContent, "svgs">> = r.content ?? {};
  const scope = c.scopeLabel ?? (r.scopeType === "national" ? "Nigeria" : r.stateName ?? r.scopeKey);
  const paragraphs = (r.narrative ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const rows = c.table?.rows ?? [];
  const isNational = r.scopeType === "national";

  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/reports" className="hover:underline">
          Reports
        </Link>{" "}
        › {TYPE_LABEL[r.type]}
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {TYPE_LABEL[r.type]} weather report: {scope}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{c.periodLabel ?? `${r.periodStart} – ${r.periodEnd}`}</span>
          <StatusBadge status={r.status} />
          {r.publishedAt && <span>Published {formatLagosDate(r.publishedAt)}</span>}
        </p>
        {r.hasPdf && (
          <Button asChild size="sm" variant="outline">
            <a href={`/reports/${r.id}/pdf`}>Download PDF</a>
          </Button>
        )}
      </header>

      {r.correctionNote && (
        <Alert className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <AlertTitle>Correction</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{r.correctionNote}</AlertDescription>
        </Alert>
      )}
      {r.status === "preliminary" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Preliminary: some days use model estimates. Figures may change slightly when the final report
          is published.
        </p>
      )}

      {c.headline && <p className="text-lg font-medium leading-snug">{c.headline}</p>}
      {paragraphs.length > 0 && (
        <div className="space-y-3 text-[15px] leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {c.stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rainfall" value={n1(c.stats.rainTotalMm, "mm")} sub={c.stats.rainPctOfNormal != null ? `${c.stats.rainPctOfNormal}% of normal` : undefined} />
          <Stat label="Average max temp" value={n1(c.stats.meanTmaxC, "°C")} sub={c.stats.tmaxAnomalyC != null ? `${formatAnomalyC(c.stats.tmaxAnomalyC)} vs normal` : undefined} />
          <Stat label="Rainy days (≥ 1 mm)" value={c.stats.rainyDays == null ? "—" : String(c.stats.rainyDays)} />
          <Stat
            label="Advisories issued"
            value={String((c.alertsIssued ?? []).reduce((s, a) => s + (a.count ?? 0), 0))}
          />
        </dl>
      )}

      {r.maps.length > 0 && (
        <section aria-label="Maps" className="grid gap-4 sm:grid-cols-2">
          {r.maps.map((m) => (
            <ReportMap
              key={m.key}
              reportId={r.id}
              mapKey={m.key}
              title={m.title}
              viewBox={m.viewBox}
              version={r.updatedAt.getTime()}
            />
          ))}
        </section>
      )}

      {c.extremes && (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Extremes">
          <Extremes title="Wettest" items={(c.extremes.wettest ?? []).map((e) => [e.name, n1(e.valueMm, "mm")])} />
          <Extremes title="Driest" items={(c.extremes.driest ?? []).map((e) => [e.name, n1(e.valueMm, "mm")])} />
          <Extremes title="Hottest" items={(c.extremes.hottest ?? []).map((e) => [e.name, n1(e.valueC, "°C")])} />
        </section>
      )}

      {rows.length > 0 && (
        <section className="space-y-2" aria-labelledby="table-title">
          <h2 id="table-title" className="font-semibold">
            By {isNational ? "state" : "LGA"}
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{isNational ? "State" : "LGA"}</th>
                  <th className="px-3 py-2 text-right font-medium">Rain</th>
                  <th className="px-3 py-2 font-medium">vs normal</th>
                  <th className="px-3 py-2 text-right font-medium">Avg max</th>
                  <th className="px-3 py-2 text-right font-medium">Anomaly</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.slug ?? row.name} className="border-b last:border-0">
                    <td className="px-3 py-1.5">
                      {row.slug ? (
                        <Link href={`/place/${isNational ? "state" : "lga"}/${row.slug}`} className="hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{n1(row.rainMm, "mm")}</td>
                    <td className="px-3 py-1.5">
                      <BandChip band={row.band} pct={row.rainPctOfNormal} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{n1(row.meanTmaxC, "°C")}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatAnomalyC(row.tmaxAnomalyC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.table?.unitNote && <p className="text-xs text-muted-foreground">{c.table.unitNote}</p>}
        </section>
      )}

      <section className="space-y-2" aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="font-semibold">
          Advisories issued
        </h2>
        {(c.alertsIssued ?? []).filter((a) => a.count > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">No automatic advisories were issued in this period.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {(c.alertsIssued ?? [])
              .filter((a) => a.count > 0)
              .map((a) => (
                <li key={a.type} className="rounded-md border px-3 py-1">
                  {ALERT_LABEL[a.type] ?? a.type}: <strong>{a.count}</strong>
                </li>
              ))}
          </ul>
        )}
      </section>

      {c.outlook && (
        <section className="space-y-2" aria-labelledby="outlook-title">
          <h2 id="outlook-title" className="font-semibold">
            Outlook
          </h2>
          <p className="text-sm">{c.outlook.text}</p>
          {(c.outlook.days ?? []).length > 0 && (
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-7">
              {c.outlook.days.map((d) => (
                <li key={d.date} className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-xs text-muted-foreground">{formatDayMonth(d.date)}</p>
                  <p className="font-medium">{n1(d.rainMm, "mm")}</p>
                  <p className="text-xs">{n1(d.tmaxC, "°C")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(c.seasonProgress ?? []).length > 0 && (
        <section className="space-y-2" aria-labelledby="season-title">
          <h2 id="season-title" className="font-semibold">
            Rainy season progress
          </h2>
          <ul className="divide-y rounded-lg border text-sm">
            {(c.seasonProgress ?? []).map((s) => (
              <li key={s.zone} className="flex justify-between gap-3 px-3 py-2">
                <span>{s.zone}</span>
                <span className="text-muted-foreground">{s.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.comingMonth?.text && (
        <section className="space-y-1">
          <h2 className="font-semibold">The coming month</h2>
          <p className="text-sm">{c.comingMonth.text}</p>
        </section>
      )}

      {c.accuracy?.text && (
        <section className="space-y-1">
          <h2 className="font-semibold">Forecast accuracy</h2>
          <p className="text-sm">{c.accuracy.text}</p>
          <p className="text-xs text-muted-foreground">
            <Link href="/accuracy" className="underline">
              Full accuracy tables
            </Link>
          </p>
        </section>
      )}

      <footer className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
        {c.methodsNote && (
          <p>
            <strong>Methods.</strong> {c.methodsNote}
          </p>
        )}
        {(c.sources ?? []).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        <p className="font-medium">
          Independent service — not affiliated with NiMet. Advisories are not official warnings.
        </p>
      </footer>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function Extremes({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ol className="space-y-0.5 text-sm">
          {items.map(([name, v], i) => (
            <li key={`${name}-${i}`} className="flex justify-between gap-2">
              <span>{name}</span>
              <span className="tabular-nums">{v}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
