import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BandChip, StatusBadge } from "@/components/climate/report-svg";
import { formatLagos } from "@/lib/time";
import { getStaffReport, type StaffReportDetail } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { Pill, TableSkeleton } from "../../_components/ui";
import { ReportEditor } from "./report-editor";

export const metadata: Metadata = { title: "Report" };

type Props = { params: Promise<{ id: string }> };

export default function StaffReportPage({ params }: Props) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ReportDetail params={params} />
    </Suspense>
  );
}

const n1 = (v: number | null | undefined, unit: string) => (v == null ? "—" : `${v.toFixed(1)} ${unit}`);
const anomaly = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)} °C`);

async function ReportDetail({ params }: Props) {
  await staffPageGuard("editor");
  const { id } = await params;
  const r = await getStaffReport(id);
  if (!r) notFound();
  const isPublic = r.publishedAt != null && r.status !== "draft" && !r.organizationId;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link href="/staff/reports" className="hover:underline">
          Report queue
        </Link>{" "}
        › {r.type === "weekly" ? "Weekly" : "Monthly"} · {r.scopeLabel}
      </nav>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {r.type === "weekly" ? "Weekly" : "Monthly"} report: {r.scopeLabel}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{r.content.periodLabel ?? `${r.periodStart} – ${r.periodEnd}`}</span>
          <StatusBadge status={r.status} />
          {r.publishedAt ? <span>Published {formatLagos(r.publishedAt)}</span> : <Pill tone="red">unpublished</Pill>}
          {r.organizationName && <Pill tone="blue">Branded: {r.organizationName}</Pill>}
          <span>Updated {formatLagos(r.updatedAt)}</span>
          {r.hasPdf ? <Pill tone="green">PDF stored</Pill> : <Pill>no PDF yet</Pill>}
          {isPublic && (
            <Link href={`/reports/${r.id}`} className="underline" target="_blank">
              View public page ↗
            </Link>
          )}
        </div>
      </header>

      <ReportEditor
        key={r.updatedAt.getTime()}
        report={{
          id: r.id,
          type: r.type,
          status: r.status,
          published: r.publishedAt != null,
          narrative: r.narrative,
          generatedNarrative: r.generatedNarrative,
          correctionNote: r.correctionNote ?? "",
          branded: !!r.organizationId,
        }}
      />

      <ReportPreview r={r} />
    </div>
  );
}

/**
 * Compact read-only preview from the content JSON. A4's report body is not
 * exported as a component, so this duplicates the key sections (headline,
 * stats, maps, extremes, table) — reusing A4's StatusBadge/BandChip.
 */
function ReportPreview({ r }: { r: StaffReportDetail }) {
  const c = r.content;
  const rows = c.table?.rows ?? [];
  const isNational = r.scopeType === "national";
  const paragraphs = r.narrative.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section aria-labelledby="preview-title" className="space-y-4 rounded-lg border p-4">
      <h2 id="preview-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Preview (from stored content)
      </h2>
      {r.correctionNote && (
        <p className="whitespace-pre-line rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-950">
          <strong>Correction:</strong> {r.correctionNote}
        </p>
      )}
      {c.headline && <p className="text-lg font-medium leading-snug">{c.headline}</p>}
      <div className="space-y-2 text-[15px] leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {c.stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rainfall" value={n1(c.stats.rainTotalMm, "mm")} sub={c.stats.rainPctOfNormal != null ? `${c.stats.rainPctOfNormal}% of normal` : undefined} />
          <Stat label="Average max temp" value={n1(c.stats.meanTmaxC, "°C")} sub={c.stats.tmaxAnomalyC != null ? `${anomaly(c.stats.tmaxAnomalyC)} vs normal` : undefined} />
          <Stat label="Rainy days (≥ 1 mm)" value={c.stats.rainyDays == null ? "—" : String(c.stats.rainyDays)} />
          <Stat label="Advisories issued" value={String((c.alertsIssued ?? []).reduce((s, a) => s + (a.count ?? 0), 0))} />
        </dl>
      )}
      {r.maps.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {r.maps.map((m) => (
            <figure key={m.key} className="rounded-lg border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- sanitized SVG from a guarded route */}
              <img
                src={`/staff/reports/${r.id}/map/${encodeURIComponent(m.key)}?v=${r.updatedAt.getTime()}`}
                alt={m.title}
                loading="lazy"
                className="h-auto w-full"
              />
              <figcaption className="pt-1 text-xs text-muted-foreground">{m.title}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {c.extremes && (
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <MiniList title="Wettest" items={(c.extremes.wettest ?? []).map((e) => [e.name, n1(e.valueMm, "mm")])} />
          <MiniList title="Driest" items={(c.extremes.driest ?? []).map((e) => [e.name, n1(e.valueMm, "mm")])} />
          <MiniList title="Hottest" items={(c.extremes.hottest ?? []).map((e) => [e.name, n1(e.valueC, "°C")])} />
        </div>
      )}
      {rows.length > 0 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            By {isNational ? "state" : "LGA"} ({rows.length} rows)
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">{isNational ? "State" : "LGA"}</th>
                  <th className="px-3 py-1.5 text-right font-medium">Rain</th>
                  <th className="px-3 py-1.5 font-medium">vs normal</th>
                  <th className="px-3 py-1.5 text-right font-medium">Avg max</th>
                  <th className="px-3 py-1.5 text-right font-medium">Anomaly</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.slug ?? row.name} className="border-b last:border-0">
                    <td className="px-3 py-1">{row.name}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{n1(row.rainMm, "mm")}</td>
                    <td className="px-3 py-1">
                      <BandChip band={row.band} pct={row.rainPctOfNormal} />
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">{n1(row.meanTmaxC, "°C")}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{anomaly(row.tmaxAnomalyC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {c.outlook?.text && <p className="text-sm"><strong>Outlook.</strong> {c.outlook.text}</p>}
      {c.comingMonth?.text && <p className="text-sm"><strong>Coming month.</strong> {c.comingMonth.text}</p>}
      {c.accuracy?.text && <p className="text-sm"><strong>Accuracy.</strong> {c.accuracy.text}</p>}
      <footer className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
        {c.methodsNote && <p>{c.methodsNote}</p>}
        {(c.sources ?? []).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </footer>
    </section>
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

function MiniList({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-1 font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        <ol className="space-y-0.5">
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
