import { Suspense } from "react";
import type { Metadata } from "next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatLagos } from "@/lib/time";
import { listJobNames, listJobRuns } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { RUN_NOW, durationLabel, retryPlanFor } from "../../_lib/policy";
import { EmptyState, PageHeader, Pager, Pill, TableSkeleton, qs, selectClass } from "../../_components/ui";
import { RetryButton, RunNowButtons } from "./job-buttons";

export const metadata: Metadata = { title: "Job runs" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const filtersSchema = z.object({
  name: z.string().max(64).optional().catch(undefined),
  status: z.enum(["running", "ok", "failed"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export default function JobsPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Job runs" description="Worker job history (job_runs). Run-now and retries go through the queue; the worker executes them." />
      <section className="mb-4 rounded-lg border p-3">
        <h2 className="mb-2 text-sm font-semibold">Run now</h2>
        <RunNowButtons jobs={RUN_NOW.map(({ key, label }) => ({ key, label }))} />
      </section>
      <Suspense fallback={<TableSkeleton />}>
        <JobsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATUS_TONE = { ok: "green", failed: "red", running: "amber" } as const;

async function JobsBody({ searchParams }: Props) {
  await staffPageGuard("admin");
  const raw = await searchParams;
  const f = filtersSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined])));
  const [{ rows, total, page, pageSize }, names] = await Promise.all([listJobRuns(f), listJobNames()]);

  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Job</span>
          <select name="name" defaultValue={f.name ?? ""} className={selectClass}>
            <option value="">All jobs</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <select name="status" defaultValue={f.status ?? ""} className={selectClass}>
            <option value="">Any</option>
            <option value="ok">ok</option>
            <option value="failed">failed</option>
            <option value="running">running</option>
          </select>
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>No job runs match.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Finished</th>
                <th className="px-3 py-2 text-right font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Error / payload</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const plan = r.status === "failed" ? retryPlanFor(r) : null;
                const payload = r.details && typeof r.details === "object" && "data" in r.details ? (r.details as { data: unknown }).data : null;
                return (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.id}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.name}</td>
                    <td className="px-3 py-1.5">
                      <Pill tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "muted"}>{r.status}</Pill>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatLagos(r.startedAt)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.finishedAt ? formatLagos(r.finishedAt) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{durationLabel(r.startedAt, r.finishedAt)}</td>
                    <td className="max-w-sm px-3 py-1.5">
                      {r.error ? (
                        <details>
                          <summary className="cursor-pointer truncate text-destructive">{r.error.split("\n")[0]}</summary>
                          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.error}</pre>
                        </details>
                      ) : payload && Object.keys(payload as object).length > 0 ? (
                        <code className="line-clamp-2 break-all text-xs text-muted-foreground">{JSON.stringify(payload)}</code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">{plan && <RetryButton runId={r.id} disabledReason={plan.ok ? null : plan.reason} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/staff/admin/jobs${qs({ name: f.name, status: f.status, page: p })}`} />
    </div>
  );
}
