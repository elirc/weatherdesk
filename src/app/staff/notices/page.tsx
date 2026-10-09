import { Suspense } from "react";
import type { Metadata } from "next";
import { formatLagos, formatLagosDate } from "@/lib/time";
import { listNotices } from "@/server/queries/staff";
import { staffPageGuard } from "../_lib/guard";
import { expiryToLagosDateInput, noticeStatus } from "../_lib/policy";
import { EmptyState, PageHeader, TableSkeleton } from "../_components/ui";
import { NoticeForm, NoticeRowActions } from "./notice-form";

export const metadata: Metadata = { title: "Notices" };

export default function NoticesPage() {
  return (
    <>
      <PageHeader
        title="Pinned notices"
        description="Editor messages shown as banners on public pages. Public pages pick up changes within a few minutes (page cache)."
      />
      <Suspense fallback={<TableSkeleton />}>
        <NoticesBody />
      </Suspense>
    </>
  );
}

async function NoticesBody() {
  await staffPageGuard("editor");
  const rows = await listNotices();
  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-4" aria-labelledby="new-notice">
        <h2 id="new-notice" className="mb-3 font-semibold">
          New notice
        </h2>
        <NoticeForm />
      </section>
      {rows.length === 0 ? (
        <EmptyState>No notices yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => {
            const status = noticeStatus(n.active, n.expiresAt);
            return (
              <li key={n.id} className={`space-y-2 rounded-lg border p-4 ${status === "live" ? "" : "opacity-70"}`}>
                <NoticeRowActions
                  key={`${n.id}-${n.active}-${n.expiresAt?.getTime() ?? 0}`}
                  notice={{
                    id: n.id,
                    title: n.title,
                    body: n.body,
                    scope: n.scope,
                    active: n.active,
                    expiresOn: expiryToLagosDateInput(n.expiresAt),
                  }}
                  meta={{
                    status,
                    created: `${formatLagos(n.createdAt)}${n.createdByEmail ? ` by ${n.createdByEmail}` : ""}`,
                    expires: n.expiresAt ? `end of ${formatLagosDate(new Date(n.expiresAt.getTime() - 1))}` : null,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
