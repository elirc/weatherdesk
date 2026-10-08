import { Badge } from "@/components/ui/badge";
import { ageLabel } from "@/lib/time";

/**
 * Provenance UI (CONVENTIONS rule 3): every displayed number carries its
 * source and fetch time; preliminary values are labelled.
 */

const SOURCE_LABELS: Record<string, string> = {
  "open-meteo": "Open-Meteo",
  "google-weather": "Google Weather",
  "nasa-power": "NASA POWER",
  nasa_power: "NASA POWER",
  model_estimate: "model estimate",
  mock: "fixture data",
  computed: "computed",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function SourceBadge({
  source,
  preliminary,
}: {
  source: string;
  preliminary?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
        {sourceLabel(source)}
      </Badge>
      {preliminary && (
        <Badge
          variant="secondary"
          className="text-[10px] font-normal bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
        >
          preliminary
        </Badge>
      )}
    </span>
  );
}

/** "Open-Meteo · 3 h ago" — shown wherever last-good data may be stale. */
export function DataAge({
  source,
  fetchedAt,
  preliminary,
}: {
  source: string;
  fetchedAt: Date;
  preliminary?: boolean;
}) {
  return (
    <span className="text-xs text-muted-foreground">
      {sourceLabel(source)} · {ageLabel(fetchedAt)}
      {preliminary ? " · preliminary" : ""}
    </span>
  );
}

/** Forecast confidence chip by lead time. */
export function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
    medium: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
    low: "bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-100",
  } as const;
  return (
    <Badge variant="secondary" className={`text-[10px] font-normal ${styles[level]}`}>
      {level} confidence
    </Badge>
  );
}
