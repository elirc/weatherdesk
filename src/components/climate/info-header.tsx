import { PlaceHeader } from "@/app/(public)/place/place-header";
import type { PlaceContext } from "@/app/(public)/place/resolve";
import { PlaceTabBar } from "@/app/(public)/place/tab-bar";

export type InfoTab = "climate" | "history" | "farming";

/** URL of an info tab for a place (A3's tabBasePath; LGA tabs for points). */
export function tabHref(ctx: PlaceContext, tab: InfoTab): string {
  return `${ctx.tabBasePath ?? ctx.basePath}/${tab}`;
}

/** Place header + tab bar, both A3's shared components, so every tab looks the same. */
export function InfoHeader({ place, tab }: { place: PlaceContext; tab: InfoTab }) {
  return (
    <div className="space-y-5">
      <PlaceHeader ctx={place} />
      <PlaceTabBar ctx={place} active={tab} />
    </div>
  );
}

export function TabSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      <div className="h-9 w-full animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

/** Friendly empty state used across the info pages. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
