import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/header";
import { staffPageGuard } from "./_lib/guard";
import { StaffNav } from "./_components/staff-nav";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s · Staff · WeatherDesk" },
  robots: { index: false, follow: false },
};

/**
 * Staff shell. The session is read inside Suspense (cacheComponents); the
 * gate renders children only for editors/admins and 404s everyone else.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <Suspense fallback={<StaffSkeleton />}>
          <StaffGate>{children}</StaffGate>
        </Suspense>
      </div>
    </>
  );
}

async function StaffGate({ children }: { children: React.ReactNode }) {
  const user = await staffPageGuard("editor");
  return (
    <>
      <aside className="md:w-52 md:shrink-0">
        <div className="mb-3 text-sm">
          <Link href="/staff" className="font-semibold">
            Staff tools
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {user.email} · {user.role}
          </p>
        </div>
        <StaffNav isAdmin={user.role === "admin"} />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </>
  );
}

function StaffSkeleton() {
  return (
    <>
      <div className="h-64 animate-pulse rounded-lg bg-muted md:w-52" />
      <div className="h-96 flex-1 animate-pulse rounded-lg bg-muted" />
    </>
  );
}
