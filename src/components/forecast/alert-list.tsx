import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ActiveAlert } from "@/server/queries/weather";
import { formatLagos } from "@/lib/time";

const TYPE_LABELS: Record<ActiveAlert["type"], string> = {
  heavy_rain: "Heavy rain",
  heat: "Extreme heat",
  wind: "Strong wind",
  dry_spell: "Dry spell",
};

export function alertTypeLabel(t: ActiveAlert["type"]): string {
  return TYPE_LABELS[t];
}

/** Amber (moderate) / red (high) advisory cards. */
export function AlertList({ alerts, showLga = false }: { alerts: ActiveAlert[]; showLga?: boolean }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-labelledby="alerts-h" className="space-y-2">
      <h2 id="alerts-h" className="text-sm font-medium text-muted-foreground">
        Active advisories ({alerts.length})
      </h2>
      {alerts.map((a) => {
        const high = a.severity === "high";
        return (
          <Alert
            key={a.id}
            className={
              high
                ? "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            }
          >
            <TriangleAlert aria-hidden />
            <AlertTitle>
              {alertTypeLabel(a.type)} · {high ? "high" : "moderate"}
              {showLga && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/place/lga/${a.lgaSlug}`} className="underline">
                    {a.lgaName}
                  </Link>
                </>
              )}
            </AlertTitle>
            <AlertDescription className="text-current/90">
              <p>{a.text}</p>
              <p className="text-xs">
                Valid {formatLagos(a.validFrom)} – {formatLagos(a.validTo)} WAT
              </p>
              <p className="text-xs italic">Automatic advisory, not an official warning.</p>
            </AlertDescription>
          </Alert>
        );
      })}
    </section>
  );
}
