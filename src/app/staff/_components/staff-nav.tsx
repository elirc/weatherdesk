"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const EDITOR_LINKS = [
  { href: "/staff/reports", label: "Reports" },
  { href: "/staff/alert-rules", label: "Alert rules" },
  { href: "/staff/notices", label: "Notices" },
];

const ADMIN_LINKS = [
  { href: "/staff/admin/health", label: "Health" },
  { href: "/staff/admin/jobs", label: "Jobs" },
  { href: "/staff/admin/users", label: "Users" },
  { href: "/staff/admin/organisations", label: "Organisations" },
  { href: "/staff/admin/plans", label: "Plans" },
  { href: "/staff/admin/api-usage", label: "API usage" },
  { href: "/staff/admin/audit", label: "Audit log" },
];

export function StaffNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const item = (l: { href: string; label: string }) => {
    const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
    return (
      <li key={l.href}>
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "block rounded-md px-2 py-1.5 text-sm hover:bg-muted",
            active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {l.label}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Staff" className="space-y-4">
      <div>
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Editor</p>
        <ul className="flex flex-wrap gap-1 md:block md:space-y-0.5">{EDITOR_LINKS.map(item)}</ul>
      </div>
      {isAdmin && (
        <div>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform admin</p>
          <ul className="flex flex-wrap gap-1 md:block md:space-y-0.5">{ADMIN_LINKS.map(item)}</ul>
        </div>
      )}
    </nav>
  );
}
