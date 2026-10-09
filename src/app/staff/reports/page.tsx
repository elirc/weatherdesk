import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLagos } from "@/lib/time";
import { listStaffReports } from "@/server/queries/staff";
import { staffPageGuard } from "../_lib/guard";
import { EmptyState, PageHeader, TableSkeleton, selectClass } from "../_components/ui";
import { ReportsTable, type ReportsTableRow } from "./reports-table";

export const metadata: Metadata = { title: "Report queue" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z.object({
  type: z.enum(["weekly", "monthly"]).optional().catch(undefined),
  status: z.enum(["draft", "preliminary", "final"]).optional().catch(undefined),
  scope: z.enum(["national", "state", "custom_area"]).optional().catch(undefined),
  published: z.enum(["yes", "no"]).optional().catch(undefined),
  from: date.optional().catch(undefined),
  to: date.optional().catch(undefined),
});

export default function StaffReportsPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Report queue" description="All generated reports, including unpublished and branded organisation copies." />
      <Suspense fallback={<TableSkeleton />}>
        <ReportsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReportsBody({ searchParams }: Props) {
  await staffPageGuard("editor");
  const raw = await searchParams;
  const f = filtersSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined])));
  const rows = await listStaffReports(f);
  const tableRows: ReportsTableRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    scopeType: r.scopeType,
    scopeLabel: r.scopeLabel,
    organization: r.organizationName ?? (r.organizationId ? r.organizationId.slice(0, 8) : null),
    period: r.periodStart === r.periodEnd ? r.periodStart : `${r.periodStart} → ${r.periodEnd}`,
    periodStart: r.periodStart,
    status: r.status,
    publishedAtMs: r.publishedAt?.getTime() ?? null,
    publishedLabel: r.publishedAt ? formatLagos(r.publishedAt) : null,
    hasPdf: r.hasPdf,
    narrativeEdited: r.narrativeEdited,
    corrected: !!r.correctionNote,
  }));

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Type</span>
          <select name="type" defaultValue={f.type ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <select name="status" defaultValue={f.status ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="preliminary">Preliminary</option>
            <option value="final">Final</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Scope</span>
          <select name="scope" defaultValue={f.scope ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="national">National</option>
            <option value="state">State</option>
            <option value="custom_area">Custom area</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Published</span>
          <select name="published" defaultValue={f.published ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="yes">Published</option>
            <option value="no">Unpublished</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Period from</span>
          <Input type="date" name="from" defaultValue={f.from ?? ""} className="h-9 w-40" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Period to</span>
          <Input type="date" name="to" defaultValue={f.to ?? ""} className="h-9 w-40" />
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        <Button asChild type="button" size="sm" variant="ghost">
          <Link href="/staff/reports">Reset</Link>
        </Button>
      </form>
      {tableRows.length === 0 ? <EmptyState>No reports match these filters.</EmptyState> : <ReportsTable rows={tableRows} />}
    </div>
  );
}
