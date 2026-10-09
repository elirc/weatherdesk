import { Sunrise, Sunset } from "lucide-react";
import { DataAge } from "@/components/weather/provenance";
import type { DailyPoint, HourlyPoint } from "@/server/queries/weather";
import { formatLagos, formatLagosTime } from "@/lib/time";
import { degToCompass, fmt, uvBand } from "./format";
import { weatherCodeInfo } from "./weather-codes";
import { WeatherIcon } from "./weather-icon";

/** "Now" block: nearest-hour forecast row + today's sunrise/sunset. */
export function NowPanel({ now, today }: { now: HourlyPoint | null; today: DailyPoint | null }) {
  if (!now) {
    return (
      <section aria-labelledby="now-h" className="rounded-lg border p-4">
        <h2 id="now-h" className="text-sm font-medium text-muted-foreground">
          Now
        </h2>
        <p className="mt-2 text-sm">No current conditions available for this spot yet.</p>
      </section>
    );
  }
  const info = weatherCodeInfo(now.weatherCode);
  const stats: [string, string][] = [
    ["Feels like", fmt(now.feelsLikeC, "°C")],
    ["Humidity", fmt(now.humidityPct, "%")],
    [
      "Wind",
      `${fmt(now.windSpeedKmh, "km/h")} ${degToCompass(now.windDirectionDeg)}${
        now.windGustsKmh !== null ? ` · gusts ${fmt(now.windGustsKmh, "km/h")}` : ""
      }`,
    ],
    ["Cloud", fmt(now.cloudCoverPct, "%")],
    ["UV index", now.uvIndex === null ? "–" : `${now.uvIndex.toFixed(0)} (${uvBand(now.uvIndex)})`],
    ["Rain chance", fmt(now.rainProbPct, "%")],
  ];
  return (
    <section aria-labelledby="now-h" className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="now-h" className="text-sm font-medium text-muted-foreground">
          Now · {formatLagos(now.validTime)} WAT
        </h2>
        <DataAge source={now.source} fetchedAt={now.fetchedAt} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <WeatherIcon code={now.weatherCode} className="size-12 text-sky-600" />
        <div>
          <p className="text-4xl font-semibold tabular-nums">{fmt(now.temperatureC, "°C")}</p>
          <p className="text-sm text-muted-foreground">{info.label}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {today && (today.sunrise || today.sunset) && (
        <p className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {today.sunrise && (
            <span className="inline-flex items-center gap-1">
              <Sunrise className="size-4" aria-hidden /> Sunrise {formatLagosTime(today.sunrise)}
            </span>
          )}
          {today.sunset && (
            <span className="inline-flex items-center gap-1">
              <Sunset className="size-4" aria-hidden /> Sunset {formatLagosTime(today.sunset)}
            </span>
          )}
        </p>
      )}
    </section>
  );
}
