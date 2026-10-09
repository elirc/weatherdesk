import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { staffOverviewCounts } from "@/server/queries/staff";
import { staffPageGuard } from "./_lib/guard";
import { PageHeader, TableSkeleton } from "./_components/ui";

export const metadata: Metadata = { title: "Overview" };

export default function StaffHome() {
  return (
    <>
      <PageHeader title="Staff overview" />
      <Suspense fallback={<TableSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const user = await staffPageGuard("editor");
  const c = await staffOverviewCounts();
  const cards = [
    { href: "/staff/reports?published=no", label: "Unpublished reports", value: c.unpublishedReports },
    { href: "/staff/notices", label: "Active notices", value: c.activeNotices },
    { href: "/staff/alert-rules", label: "Disabled alert rules", value: c.disabledRules },
    ...(user.role === "admin" ? [{ href: "/staff/admin/jobs?status=failed", label: "Failed jobs (24 h)", value: c.failedJobs24h }] : []),
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <li key={card.href}>
          <Link href={card.href} className="block rounded-lg border p-4 hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
