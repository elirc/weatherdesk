import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionNav, SignOutButton } from "./_components/nav";

export const metadata: Metadata = { title: "My WeatherDesk", robots: { index: false } };

const LINKS = [
  { href: "/dashboard", label: "Saved places" },
  { href: "/dashboard/subscriptions", label: "Report emails" },
  { href: "/dashboard/daily", label: "Daily SMS" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/org", label: "Organisations" },
];

/** Session-scoped area: static shell, every page body streams inside Suspense. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <SectionNav links={LINKS} />
          <SignOutButton />
        </div>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
