import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/climate/info-header";
import { StatusBadge } from "@/components/climate/report-svg";
import { monthName } from "@/components/climate/lib/doy";
import { formatLagosDate } from "@/lib/time";
import { listNotices } from "@/server/queries/alerts";
import { listStates } from "@/server/queries/geo";
import { listPublicReportYears, listPublicReports, type ReportFilters, type ReportListItem } from "@/server/queries/reports";

export const metadata: Metadata = {
  title: "Weather reports",
  description:
    "Weekly and monthly weather reports for Nigeria and every state: rainfall vs normal, temperature, extremes, advisories and outlook.",
  alternates: { canonical: "/reports" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

const filterSchema = z.object({
  type: z.enum(["weekly", "monthly"]).optional().catch(undefined),
  scope: z
    .string()
    .regex(/^[a-z0-9-]{2,64}$/)
    .optional()
    .catch(undefined),
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
});

async function loadArchive(f: ReportFilters) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });
  const [reports, years, states, notices] = await Promise.all([
    listPublicReports(f),
    listPublicReportYears(),
    listStates(),
    listNotices(["reports"], new Date()),
  ]);
  return { reports, years, states: states.map((s) => ({ slug: s.slug, name: s.name })), notices };
}

export default function ReportsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Weather reports</h1>
        <p className="text-sm text-muted-foreground">
          Weekly reports are published every Monday for the previous week. Monthly reports appear as{" "}
          <em>preliminary</em> early in the month and become <em>final</em> once NASA POWER
          observations are complete.
        </p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
        <Archive searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function groupLabel(r: ReportListItem) {
  return `${monthName(Number(r.periodStart.slice(5, 7)))} ${r.periodStart.slice(0, 4)}`;
}

async function Archive({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = filterSchema.parse({ type: first(sp.type), scope: first(sp.scope), year: first(sp.year) });
  const d = await loadArchive(f);
  const groups = new Map<string, ReportListItem[]>();
  for (const r of d.reports) {
    const k = groupLabel(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const filtered = !!(f.type || f.scope || f.year);

  return (
    <div className="space-y-6">
      {d.notices.map((n) => (
        <Alert key={n.id}>
          <AlertTitle>{n.title}</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{n.body}</AlertDescription>
        </Alert>
      ))}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border p-4 text-sm">
        <label className="flex flex-col gap-1">
          Type
          <select name="type" defaultValue={f.type ?? ""} className="rounded-md border bg-background px-2 py-1.5">
            <option value="">All</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Area
          <select name="scope" defaultValue={f.scope ?? ""} className="rounded-md border bg-background px-2 py-1.5">
            <option value="">All</option>
            <option value="national">Nigeria (national)</option>
            {d.states.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Year
          <select name="year" defaultValue={f.year ? String(f.year) : ""} className="rounded-md border bg-background px-2 py-1.5">
            <option value="">All</option>
            {d.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        {filtered && (
          <Link href="/reports" className="text-xs text-muted-foreground underline">
            Clear filters
          </Link>
        )}
      </form>

      {d.reports.length === 0 ? (
        <EmptyState title={filtered ? "No reports match these filters." : "No reports published yet."}>
          {filtered
            ? "Try another type, area or year."
            : "The first weekly report is published on the Monday after a full week of data."}
        </EmptyState>
      ) : (
        [...groups].map(([label, list]) => (
          <section key={label} aria-label={label} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
            <ul className="divide-y rounded-lg border">
              {list.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      <Link href={`/reports/${r.id}`} className="hover:underline">
                        {r.type === "weekly" ? "Weekly" : "Monthly"} · {r.scopeType === "national" ? "Nigeria" : r.stateName ?? r.scopeKey}{" "}
                        · {r.periodLabel ?? `${r.periodStart} – ${r.periodEnd}`}
                      </Link>
                    </p>
                    {r.headline && <p className="truncate text-sm text-muted-foreground">{r.headline}</p>}
                    <p className="text-xs text-muted-foreground">
                      <StatusBadge status={r.status} />
                      {r.publishedAt && ` Published ${formatLagosDate(r.publishedAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reports/${r.id}`}>Read</Link>
                    </Button>
                    {r.hasPdf && (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/reports/${r.id}/pdf`}>PDF</a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
