import { cacheLife } from "next/cache";
import { Info } from "lucide-react";
import { AlertList } from "@/components/forecast/alert-list";
import { DailyList } from "@/components/forecast/daily-list";
import { HourCards } from "@/components/forecast/hour-cards";
import { HourlyChart, type HourlyChartPoint } from "@/components/forecast/hourly-chart";
import { NowPanel } from "@/components/forecast/now-panel";
import { ForecastProvenance, StaleDataAlert } from "@/components/forecast/provenance-footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatLagos, formatLagosTime, lagosToday } from "@/lib/time";
import {
  activeAlertsForLga,
  activeAlertsForState,
  daily16,
  latestHourly,
  newestDailyFetch,
  nowRow,
} from "@/server/queries/weather";
import type { PlaceContext } from "../resolve";
import { EmbedDetails } from "./embed-details";

/**
 * Forecast tab body. A cached server component: 30 min for named places,
 * 5 min for points (so an activated cell shows up quickly).
 */
export async function ForecastView({ ctx }: { ctx: PlaceContext }) {
  "use cache";
  cacheLife(
    ctx.kind === "point"
      ? { stale: 60, revalidate: 300, expire: 3600 }
      : { stale: 300, revalidate: 1800, expire: 86400 },
  );

  const now = new Date();
  const today = lagosToday();
  const cell = ctx.gridCellId;

  const [current, hours, days, newest, alerts] = await Promise.all([
    cell ? nowRow(cell, now) : null,
    cell ? latestHourly(cell, 48, now) : [],
    cell ? daily16(cell, today) : [],
    cell ? newestDailyFetch(cell) : null,
    ctx.kind === "state" && ctx.stateId
      ? activeAlertsForState(ctx.stateId, now)
      : ctx.lgaId
        ? activeAlertsForLga(ctx.lgaId, now)
        : [],
  ]);

  const todayRow = days.find((d) => d.date === today) ?? null;
  const chartData: HourlyChartPoint[] = hours.map((h) => ({
    label: formatLagosTime(h.validTime),
    fullLabel: formatLagos(h.validTime),
    tempC: h.temperatureC,
    rainMm: h.rainMm,
    rainProbPct: h.rainProbPct,
  }));

  return (
    <div className="space-y-6">
      {ctx.kind === "point" && ctx.needsActivation && (
        <Alert>
          <Info aria-hidden />
          <AlertDescription>
            Preparing a detailed forecast for this spot — showing the nearest available data for now.
            {ctx.gridCellId === null && " No nearby forecast is available yet; check back in a few minutes."}
          </AlertDescription>
        </Alert>
      )}
      {ctx.cellNote && <p className="text-xs text-muted-foreground">{ctx.cellNote}.</p>}

      <StaleDataAlert fetchedAt={newest?.fetchedAt ?? null} now={now} />

      <NowPanel now={current} today={todayRow} />

      <AlertList alerts={alerts} showLga={ctx.kind === "state"} />

      <section aria-labelledby="h48" className="space-y-3">
        <h2 id="h48" className="text-lg font-semibold">
          Next 48 hours
        </h2>
        {hours.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hourly forecast available yet.</p>
        ) : (
          <>
            <HourlyChart data={chartData} />
            <p className="text-xs text-muted-foreground">
              Orange line: temperature (°C). Blue bars: rain per hour (mm). Times in WAT.
            </p>
            <HourCards hours={hours} />
          </>
        )}
      </section>

      <section aria-labelledby="h16" className="space-y-3">
        <h2 id="h16" className="text-lg font-semibold">
          16 days
        </h2>
        <DailyList days={days} today={today} />
      </section>

      <ForecastProvenance source={newest?.source ?? days[0]?.source ?? "unknown"} fetchedAt={newest?.fetchedAt ?? null} />

      {ctx.widget && <EmbedDetails kind={ctx.widget.kind} id={ctx.widget.id} name={ctx.name} />}
    </div>
  );
}
