import { Suspense } from "react";
import type { Metadata } from "next";
import { addDaysIso, ageLabel, dateRange, lagosToday } from "@/lib/time";
import { apiUsageByOrgDay, topApiKeys } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { pivotUsage } from "../../_lib/policy";
import { EmptyState, PageHeader, Pill, TableSkeleton } from "../../_components/ui";
import { UsageChart } from "./usage-chart";

export const metadata: Metadata = { title: "API usage" };

export default function ApiUsagePage() {
  return (
    <>
      <PageHeader title="API usage" description="Public API calls per organisation over the last 30 days (api_usage)." />
      <Suspense fallback={<TableSkeleton />}>
        <UsageBody />
      </Suspense>
    </>
  );
}

async function UsageBody() {
  await staffPageGuard("admin");
  const today = lagosToday();
  const from = addDaysIso(today, -29);
  const [byDay, keys] = await Promise.all([apiUsageByOrgDay(from), topApiKeys(from)]);
  const total = byDay.reduce((s, r) => s + r.total, 0);
  const { data, series } = pivotUsage(byDay, dateRange(from, today));
  const now = new Date();

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">
          Calls per day by organisation · {from} → {today} · {total.toLocaleString("en-NG")} total
        </h2>
        {total === 0 ? <EmptyState>No API calls recorded in the last 30 days.</EmptyState> : <UsageChart data={data} series={series} />}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Top API keys (30 days)</h2>
        {keys.length === 0 ? (
          <EmptyState>No key activity.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Organisation</th>
                  <th className="px-3 py-2 text-right font-medium">Calls</th>
                  <th className="px-3 py-2 text-right font-medium">Endpoints</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.apiKeyId} className="border-b last:border-0">
                    <td className="px-3 py-1.5">
                      {k.keyName} <code className="text-xs text-muted-foreground">{k.prefix}…</code>{" "}
                      {k.revokedAt && <Pill tone="red">revoked</Pill>}
                    </td>
                    <td className="px-3 py-1.5">{k.organizationName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{k.total.toLocaleString("en-NG")}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{k.endpoints}</td>
                    <td className="px-3 py-1.5">{k.lastUsedAt ? ageLabel(k.lastUsedAt, now) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
