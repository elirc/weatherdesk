import { Suspense } from "react";
import type { Metadata } from "next";
import { formatLagos } from "@/lib/time";
import { listAlertRules } from "@/server/queries/staff";
import { staffPageGuard } from "../_lib/guard";
import { EmptyState, PageHeader, TableSkeleton } from "../_components/ui";
import { THRESHOLD_RANGES } from "../_lib/policy";
import { AlertRuleCard } from "./alert-rule-card";

export const metadata: Metadata = { title: "Alert rules" };

export default function AlertRulesPage() {
  return (
    <>
      <PageHeader
        title="Alert rules"
        description="Thresholds the daily pipeline uses to issue advisories. Changes apply from the next pipeline run."
      />
      <Suspense fallback={<TableSkeleton />}>
        <RulesBody />
      </Suspense>
    </>
  );
}

async function RulesBody() {
  await staffPageGuard("editor");
  const rules = await listAlertRules();
  if (rules.length === 0) return <EmptyState>No alert rules are configured.</EmptyState>;
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Template placeholders: <code>{"{lga}"}</code> LGA name · <code>{"{value}"}</code> forecast value ·{" "}
        <code>{"{threshold}"}</code> this rule&apos;s threshold · <code>{"{date}"}</code> day (Lagos). Advisories are not official warnings.
      </p>
      {rules.map((r) => (
        <AlertRuleCard
          key={`${r.id}-${r.updatedAt.getTime()}`}
          rule={{
            id: r.id,
            type: r.type,
            threshold: r.threshold,
            severity: r.severity,
            enabled: r.enabled,
            template: r.template,
          }}
          range={THRESHOLD_RANGES[r.type]}
          updatedLabel={`${formatLagos(r.updatedAt)}${r.updatedByEmail ? ` by ${r.updatedByEmail}` : ""}`}
        />
      ))}
    </div>
  );
}
