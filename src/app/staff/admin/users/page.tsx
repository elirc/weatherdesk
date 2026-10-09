import { Suspense } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLagosDate } from "@/lib/time";
import { searchUsers } from "@/server/queries/staff";
import { staffPageGuard } from "../../_lib/guard";
import { EmptyState, PageHeader, TableSkeleton } from "../../_components/ui";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = { title: "Users" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function UsersPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Users" description="Search accounts and assign platform roles. You cannot change your own role." />
      <Suspense fallback={<TableSkeleton />}>
        <UsersBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UsersBody({ searchParams }: Props) {
  const me = await staffPageGuard("admin");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  const rows = await searchUsers(q);
  return (
    <div className="space-y-3">
      <form method="get" className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Email or name" className="h-9 max-w-xs" aria-label="Search users" />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>No users found.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Orgs</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{u.email}</td>
                  <td className="px-3 py-1.5">{u.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{u.orgCount}</td>
                  <td className="px-3 py-1.5">{formatLagosDate(u.createdAt)}</td>
                  <td className="px-3 py-1.5">
                    <RoleSelect key={`${u.id}-${u.role}`} userId={u.id} email={u.email} role={u.role} isSelf={u.id === me.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
