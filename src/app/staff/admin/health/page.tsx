import { Suspense } from "react";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { ageLabel, formatLagos } from "@/lib/time";
import { listSourceHealth } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { KNOWN_SOURCES, budgetPercent, isSourceUnhealthy } from "../../_lib/policy";
import { PageHeader, Pill, TableSkeleton } from "../../_components/ui";

export const metadata: Metadata = { title: "Data source health" };

export default function HealthPage() {
  return (
    <>
      <PageHeader title="Data source health" description="Provider success/failure tracking written by worker jobs (source_health)." />
      <Suspense fallback={<TableSkeleton />}>
        <HealthBody />
      </Suspense>
    </>
  );
}

async function HealthBody() {
  await staffPageGuard("admin");
  const rows = await listSourceHealth();
  const now = new Date();
  const budget = env.PROVIDER_CALL_BUDGET_MONTHLY;
  const bySource = new Map(rows.map((r) => [r.source, r]));
  const sources = [...new Set<string>([...rows.map((r) => r.source), ...KNOWN_SOURCES])];
  const mockNote = env.WD_MODE === "mock";

  return (
    <div className="space-y-3">
      {mockNote && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Adapters run in mock mode (WD_MODE=mock): mock drivers make no provider calls, so sources may show no activity.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last success</th>
              <th className="px-3 py-2 font-medium">Last error</th>
              <th className="px-3 py-2 text-right font-medium">Latency</th>
              <th className="px-3 py-2 text-right font-medium">Consecutive failures</th>
              <th className="px-3 py-2 font-medium">Calls this month (budget {budget.toLocaleString("en-NG")})</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const r = bySource.get(source);
              if (!r) {
                return (
                  <tr key={source} className="border-b last:border-0 text-muted-foreground">
                    <td className="px-3 py-2 font-medium text-foreground">{source}</td>
                    <td className="px-3 py-2">
                      <Pill>no data</Pill>
                    </td>
                    <td className="px-3 py-2" colSpan={5}>
                      No calls recorded yet.
                    </td>
                  </tr>
                );
              }
              const bad = isSourceUnhealthy(r, now);
              const { calls, pct } = budgetPercent(r, budget, now);
              return (
                <tr key={source} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 font-medium">{source}</td>
                  <td className="px-3 py-2">{bad ? <Pill tone="red">attention</Pill> : <Pill tone="green">healthy</Pill>}</td>
                  <td className="px-3 py-2" title={r.lastSuccessAt ? formatLagos(r.lastSuccessAt) : undefined}>
                    {r.lastSuccessAt ? ageLabel(r.lastSuccessAt, now) : "never"}
                  </td>
                  <td className="px-3 py-2">
                    {r.lastErrorAt ? (
                      <details>
                        <summary className="cursor-pointer" title={formatLagos(r.lastErrorAt)}>
                          {ageLabel(r.lastErrorAt, now)}
                        </summary>
                        <pre className="mt-1 max-w-xs whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.lastError}</pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.latencyMs != null ? `${r.latencyMs} ms` : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.consecutiveFailures >= 3 ? "font-semibold text-destructive" : ""}`}>
                    {r.consecutiveFailures}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-32 overflow-hidden rounded bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        aria-label={`${source} calls vs monthly budget`}
                      >
                        <div className={`h-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-xs">
                        {calls.toLocaleString("en-NG")} ({pct}%)
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Red when 3+ consecutive failures or no success in the last 24 h. Budget counts only the current UTC month.
      </p>
    </div>
  );
}
