import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { pageUser } from "@/lib/api/page-guards";
import { formatLagos } from "@/lib/time";
import { listNotifications } from "@/server/queries/account";

/** /dashboard/notifications — the last 50 notifications (payload: { subject?, text, html?, to? }). */
async function NotificationsPageContent() {
  const user = await pageUser("/dashboard/notifications");
  const rows = await listNotifications(user.id, 50);
  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Notifications</h1>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing yet. Advisories for saved places, report emails and daily sends appear here.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((n) => {
            const p = (n.payload ?? {}) as { subject?: string; text?: string };
            return (
              <li key={n.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.subject ?? n.kind.replace(/_/g, " ")}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {n.channel}
                  </Badge>
                  <Badge variant={n.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                    {n.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{formatLagos(n.sentAt ?? n.createdAt)}</span>
                </div>
                {p.text && <p className="line-clamp-3 text-sm text-muted-foreground">{p.text}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Own Suspense boundary: session reads must stream for instant navigations (cacheComponents). */
export default function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <NotificationsPageContent />
    </Suspense>
  );
}
