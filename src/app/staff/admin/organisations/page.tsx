import { Suspense } from "react";
import type { Metadata } from "next";
import { formatLagosDate } from "@/lib/time";
import { listOrganisations } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { EmptyState, PageHeader, Pill, TableSkeleton } from "../../_components/ui";

export const metadata: Metadata = { title: "Organisations" };

export default function OrganisationsPage() {
  return (
    <>
      <PageHeader title="Organisations" description="Every organisation with its current plan, subscription state and usage footprint." />
      <Suspense fallback={<TableSkeleton />}>
        <OrgsBody />
      </Suspense>
    </>
  );
}

const SUB_TONE: Record<string, "green" | "amber" | "red" | "muted"> = { active: "green", trialing: "green", past_due: "amber", canceled: "red" };

async function OrgsBody() {
  await staffPageGuard("admin");
  const rows = await listOrganisations();
  if (rows.length === 0) return <EmptyState>No organisations yet.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Organisation</th>
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 font-medium">Subscription</th>
            <th className="px-3 py-2 text-right font-medium">Members</th>
            <th className="px-3 py-2 text-right font-medium">Custom areas</th>
            <th className="px-3 py-2 text-right font-medium">Active API keys</th>
            <th className="px-3 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="px-3 py-1.5">
                <span className="font-medium">{o.name}</span> <span className="text-xs text-muted-foreground">/{o.slug}</span>
              </td>
              <td className="px-3 py-1.5">{o.planName ?? <span className="text-muted-foreground">Free (no subscription)</span>}</td>
              <td className="px-3 py-1.5">
                {o.subStatus ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <Pill tone={SUB_TONE[o.subStatus] ?? "muted"}>{o.subStatus}</Pill>
                    {o.currentPeriodEnd && <span className="text-xs text-muted-foreground">until {formatLagosDate(o.currentPeriodEnd)}</span>}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{o.memberCount}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{o.customAreaCount}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{o.activeKeyCount}</td>
              <td className="px-3 py-1.5">{formatLagosDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
