import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDaysIso, formatLagos, lagosMidnightUtc } from "@/lib/time";
import { listAudit, listAuditEntities } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { EmptyState, PageHeader, Pager, TableSkeleton, qs, selectClass } from "../../_components/ui";

export const metadata: Metadata = { title: "Audit log" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z.object({
  action: z.string().max(64).optional().catch(undefined),
  entity: z.string().max(64).optional().catch(undefined),
  actor: z.string().max(120).optional().catch(undefined),
  from: date.optional().catch(undefined),
  to: date.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export default function AuditPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Audit log" description="Every staff action, newest first. Dates are Lagos days." />
      <Suspense fallback={<TableSkeleton />}>
        <AuditBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AuditBody({ searchParams }: Props) {
  await staffPageGuard("admin");
  const raw = await searchParams;
  const f = filtersSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined])));
  const [{ rows, total, page, pageSize }, entities] = await Promise.all([
    listAudit({
      action: f.action,
      entity: f.entity,
      actor: f.actor,
      from: f.from ? lagosMidnightUtc(f.from) : undefined,
      to: f.to ? lagosMidnightUtc(addDaysIso(f.to, 1)) : undefined,
      page: f.page,
    }),
    listAuditEntities(),
  ]);

  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Action contains</span>
          <Input name="action" defaultValue={f.action ?? ""} placeholder="report.publish" className="h-9 w-40" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Entity</span>
          <select name="entity" defaultValue={f.entity ?? ""} className={selectClass}>
            <option value="">Any</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Actor email</span>
          <Input name="actor" defaultValue={f.actor ?? ""} className="h-9 w-48" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={f.from ?? ""} className="h-9 w-40" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={f.to ?? ""} className="h-9 w-40" />
        </label>
        <Button type="submit" size="sm">
          Filter
        </Button>
        <Button asChild type="button" size="sm" variant="ghost">
          <Link href="/staff/admin/audit">Reset</Link>
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>No audit entries match.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5">{formatLagos(r.createdAt)}</td>
                  <td className="px-3 py-1.5">{r.actorEmail ?? <span className="text-muted-foreground">system</span>}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {r.entity}
                    {r.entityId && <span className="block truncate text-muted-foreground" title={r.entityId}>{r.entityId}</span>}
                  </td>
                  <td className="max-w-md px-3 py-1.5">
                    {r.details ? (
                      <details>
                        <summary className="cursor-pointer truncate text-xs text-muted-foreground">{JSON.stringify(r.details).slice(0, 80)}</summary>
                        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.details, null, 2)}</pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={page}
        pageSize={pageSize}
        total={total}
        hrefFor={(p) => `/staff/admin/audit${qs({ action: f.action, entity: f.entity, actor: f.actor, from: f.from, to: f.to, page: p })}`}
      />
    </div>
  );
}
