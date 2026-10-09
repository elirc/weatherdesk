import type { HourlyPoint } from "@/server/queries/weather";
import { formatLagosTime } from "@/lib/time";
import { fmt } from "./format";
import { WeatherIcon } from "./weather-icon";

/** Horizontally scrollable hour cards (phone-friendly, no JS). */
export function HourCards({ hours }: { hours: HourlyPoint[] }) {
  if (hours.length === 0) return null;
  return (
    <ol
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 text-center text-xs"
      aria-label="Hourly forecast"
    >
      {hours.map((h) => (
        <li
          key={h.validTime.toISOString()}
          className="flex w-16 shrink-0 snap-start flex-col items-center gap-1 rounded-md border px-1 py-2"
        >
          <span className="text-muted-foreground">{formatLagosTime(h.validTime)}</span>
          <WeatherIcon code={h.weatherCode} className="size-5 text-sky-600" />
          <span className="font-medium tabular-nums">{fmt(h.temperatureC, "°C")}</span>
          <span className="tabular-nums text-blue-700 dark:text-blue-300">{fmt(h.rainMm, "mm", 1)}</span>
          <span className="tabular-nums text-muted-foreground">{fmt(h.rainProbPct, "%")}</span>
        </li>
      ))}
    </ol>
  );
}
