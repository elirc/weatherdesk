import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Organisations", robots: { index: false } };

/** Session-scoped area: static shell; page bodies stream inside Suspense. */
export default function OrgRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
