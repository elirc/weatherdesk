import Link from "next/link";
import { cacheLife } from "next/cache";
import { MapPin } from "lucide-react";
import { NoticeBanner } from "@/components/forecast/notice-banner";
import { PlaceSearch } from "@/components/search/place-search";
import { activeNotices } from "@/server/queries/weather";
import type { PlaceContext } from "./resolve";

/**
 * Place header block: breadcrumbs, name, state/zone line, active notices
 * for this place (+ global), and a compact search box. Cached component
 * (10 min) — safe to use from any place sub-route:
 *
 *   <PlaceHeader ctx={ctx} />
 */
export async function PlaceHeader({ ctx }: { ctx: PlaceContext }) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 86400 });
  const scopes = ["global", ...(ctx.noticeScope ? [ctx.noticeScope] : [])];
  const notices = await activeNotices(scopes);

  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              {ctx.breadcrumbs.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>›</span>}
                  {b.href ? (
                    <Link href={b.href} className="hover:text-foreground hover:underline">
                      {b.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{b.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{ctx.name}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {ctx.subtitle}
          </p>
        </div>
        <PlaceSearch compact placeholder="Search another place…" />
      </div>
      <NoticeBanner notices={notices.map(({ id, title, body }) => ({ id, title, body }))} />
    </header>
  );
}
