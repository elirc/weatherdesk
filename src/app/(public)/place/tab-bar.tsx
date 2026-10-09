import Link from "next/link";
import type { PlaceContext } from "./resolve";

/**
 * Place tab bar: Forecast | Climate | History | Farming. Forecast is the
 * place's base route (A3); the other three are A4's sub-routes
 * (<tabBasePath>/climate etc.). For points the sub-tabs link to the
 * containing LGA's pages; when there is none they are hidden.
 *
 *   <PlaceTabBar ctx={ctx} active="climate" />
 */

export type PlaceTab = "forecast" | "climate" | "history" | "farming";

export function placeTabs(ctx: Pick<PlaceContext, "basePath" | "tabBasePath">) {
  const tabs: { id: PlaceTab; label: string; href: string }[] = [
    { id: "forecast", label: "Forecast", href: ctx.basePath },
  ];
  if (ctx.tabBasePath) {
    tabs.push(
      { id: "climate", label: "Climate", href: `${ctx.tabBasePath}/climate` },
      { id: "history", label: "History", href: `${ctx.tabBasePath}/history` },
      { id: "farming", label: "Farming", href: `${ctx.tabBasePath}/farming` },
    );
  }
  return tabs;
}

export function PlaceTabBar({ ctx, active }: { ctx: PlaceContext; active: PlaceTab }) {
  const tabs = placeTabs(ctx);
  return (
    <nav aria-label="Place sections" className="-mx-4 overflow-x-auto border-b px-4">
      <ul className="flex gap-1 text-sm">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2 whitespace-nowrap ${
                  isActive
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {ctx.kind === "point" && t.id !== "forecast" && ctx.lgaName ? (
                  <span className="sr-only"> for {ctx.lgaName} LGA</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
