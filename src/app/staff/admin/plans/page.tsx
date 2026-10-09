import { Suspense } from "react";
import type { Metadata } from "next";
import { formatKobo, koboToNaira } from "@/lib/money";
import { listPlans } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { EmptyState, PageHeader, TableSkeleton } from "../../_components/ui";
import { PlanCard } from "./plan-card";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <>
      <PageHeader
        title="Plans"
        description="Monthly prices (naira, stored as kobo) and limits. Paystack plan codes are not changed here — re-sync billing after price edits."
      />
      <Suspense fallback={<TableSkeleton />}>
        <PlansBody />
      </Suspense>
    </>
  );
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

async function PlansBody() {
  await staffPageGuard("admin");
  const rows = await listPlans();
  if (rows.length === 0) return <EmptyState>No plans configured.</EmptyState>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((p) => {
        const l = (p.limits ?? {}) as Record<string, unknown>;
        return (
          <PlanCard
            key={`${p.id}-${p.priceKoboMonthly}-${JSON.stringify(l)}-${p.active}`}
            plan={{
              id: p.id,
              name: p.name,
              kind: p.kind,
              priceLabel: formatKobo(p.priceKoboMonthly),
              priceNaira: koboToNaira(p.priceKoboMonthly),
              apiCallsPerDay: num(l.apiCallsPerDay),
              customAreas: num(l.customAreas),
              downloads: l.downloads === true,
              brandedReports: l.brandedReports === true,
              active: p.active,
              otherLimits: Object.fromEntries(
                Object.entries(l).filter(([k]) => !["apiCallsPerDay", "customAreas", "downloads", "brandedReports"].includes(k)),
              ),
              paystackPlanCode: p.paystackPlanCode,
            }}
          />
        );
      })}
    </div>
  );
}
