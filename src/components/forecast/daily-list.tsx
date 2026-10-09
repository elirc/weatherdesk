import { ConfidenceBadge } from "@/components/weather/provenance";
import type { DailyPoint } from "@/server/queries/weather";
import { confidenceLabel } from "@/lib/weather/constants";
import { daysBetween, fmt, relativeDayLabel } from "./format";
import { weatherCodeInfo } from "./weather-codes";
import { WeatherIcon } from "./weather-icon";

/** 16-day list: one row per day with confidence by lead time. */
export function DailyList({ days, today }: { days: DailyPoint[]; today: string }) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">No daily forecast available yet.</p>;
  }
  return (
    <ol className="divide-y rounded-lg border" aria-label="16-day forecast">
      {days.map((d) => {
        const lead = Math.max(0, daysBetween(today, d.date));
        const info = weatherCodeInfo(d.weatherCode);
        return (
          <li key={d.date} className="grid grid-cols-[5.5rem_2rem_1fr] items-center gap-2 px-3 py-2 text-sm sm:grid-cols-[7rem_2rem_6rem_1fr_auto]">
            <span className="font-medium">{relativeDayLabel(d.date, today)}</span>
            <WeatherIcon code={d.weatherCode} className="size-5 text-sky-600" />
            <span className="tabular-nums">
              <span className="font-medium">{fmt(d.tmaxC, "°C")}</span>
              <span className="text-muted-foreground"> / {fmt(d.tminC, "°C")}</span>
            </span>
            <span className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:text-sm">
              <span className="sr-only sm:not-sr-only">{info.label}</span>
              <span className="tabular-nums text-blue-700 dark:text-blue-300">
                {fmt(d.rainMm, "mm", 1)} · {fmt(d.rainProbPct, "%")}
              </span>
              <span className="tabular-nums">wind {fmt(d.windMaxKmh, "km/h")}</span>
            </span>
            <span className="col-span-3 sm:col-span-1">
              <ConfidenceBadge level={confidenceLabel(lead)} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
