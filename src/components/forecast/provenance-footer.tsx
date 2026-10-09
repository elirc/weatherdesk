import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataAge, SourceBadge } from "@/components/weather/provenance";
import { ageLabel } from "@/lib/time";
import { isStale } from "./format";

/**
 * Provider-outage banner (CONVENTIONS rule 5): shown when the newest forecast
 * fetch is older than 12 h — the page still renders the last good data.
 */
export function StaleDataAlert({ fetchedAt, now }: { fetchedAt: Date | null; now: Date }) {
  if (!fetchedAt || !isStale(fetchedAt, now)) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <CircleAlert aria-hidden />
      <AlertTitle>Forecast update delayed</AlertTitle>
      <AlertDescription className="text-current/90">
        Showing last good data from {ageLabel(fetchedAt, now)}. It refreshes automatically when the
        provider is back.
      </AlertDescription>
    </Alert>
  );
}

export function ForecastProvenance({ source, fetchedAt }: { source: string; fetchedAt: Date | null }) {
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
      <span>Forecast source</span>
      <SourceBadge source={source} />
      {fetchedAt && <DataAge source={source} fetchedAt={fetchedAt} />}
      <span>· Times in WAT (UTC+1). Confidence falls with lead time.</span>
    </footer>
  );
}
