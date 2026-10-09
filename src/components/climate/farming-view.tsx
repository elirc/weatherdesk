import { cacheLife } from "next/cache";
import type { PlaceContext } from "@/app/(public)/place/resolve";
import { DataAge, SourceBadge } from "@/components/weather/provenance";
import { RAINY_DAY_MM } from "@/lib/weather/constants";
import { addDaysIso, lagosToday } from "@/lib/time";
import {
  getForecastDays,
  getRainSeries,
  getSeasonNormal,
  type ForecastDay,
} from "@/server/queries/climate";
import { EmptyState, InfoHeader } from "./info-header";
import { aroundDate, formatDayMonth } from "./lib/doy";
import {
  computeOnsetStatus,
  countDryDays,
  onsetSentence,
  seasonSearchStart,
  type OnsetStatus,
} from "./lib/onset-status";

/** Farming tab — plain language, phone-first. Cached ~1 h. */

type FarmingData = {
  today: string;
  forecast: ForecastDay[];
  status: OnsetStatus;
  normalOnset: string | null;
  normalCessation: string | null;
  lastObserved: string | null;
};

async function loadFarming(cellId: number): Promise<FarmingData> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  const today = lagosToday();
  const year = Number(today.slice(0, 4));
  const [forecast, season, series] = await Promise.all([
    getForecastDays(cellId, today, 7),
    getSeasonNormal(cellId),
    getRainSeries(cellId, seasonSearchStart(year), addDaysIso(today, -1)),
  ]);
  const status = computeOnsetStatus({
    today,
    series,
    normalOnsetDoy: season?.onsetDoy ?? null,
    normalCessationDoy: season?.cessationDoy ?? null,
  });
  return {
    today,
    forecast,
    status,
    normalOnset: aroundDate(season?.onsetDoy),
    normalCessation: aroundDate(season?.cessationDoy),
    lastObserved: series.length ? series[series.length - 1].date : null,
  };
}

const weekday = (iso: string) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${iso}T00:00:00Z`).getUTCDay()];

function rainWords(mm: number | null): string {
  if (mm == null) return "no data";
  if (mm < RAINY_DAY_MM) return "dry";
  if (mm < 10) return "light rain";
  if (mm < 30) return "moderate rain";
  return "heavy rain";
}

export async function FarmingView({ place }: { place: PlaceContext }) {
  if (place.gridCellId == null) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <InfoHeader place={place} tab="farming" />
        <EmptyState title="No farming data for this spot yet.">
          We are preparing data for this location. Try the nearest LGA page meanwhile.
        </EmptyState>
      </div>
    );
  }
  const d = await loadFarming(place.gridCellId);
  const total = d.forecast.reduce((s, f) => s + (f.rainMm ?? 0), 0);
  const dry = countDryDays(d.forecast);
  const newest = d.forecast.reduce<ForecastDay | null>((a, f) => (!a || f.fetchedAt > a.fetchedAt ? f : a), null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <InfoHeader place={place} tab="farming" />

      <section className="rounded-lg border p-4 space-y-2" aria-labelledby="onset-title">
        <h2 id="onset-title" className="font-semibold">
          Have the rains started?
        </h2>
        <p className="text-lg leading-snug">{onsetSentence(d.status)}</p>
        <p className="text-sm text-muted-foreground">
          {d.normalOnset && d.normalCessation
            ? `In a normal year the rains start ${d.normalOnset} and end ${d.normalCessation}.`
            : "Normal season dates are not available here yet."}{" "}
          We count the rains as started when at least 20 mm falls within 3 days and no 10-day dry
          spell follows in the next 30 days.
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Measured rain up to {d.lastObserved ? formatDayMonth(d.lastObserved) : "—"}
          <SourceBadge source="nasa-power" />
        </p>
      </section>

      {d.forecast.length === 0 ? (
        <EmptyState title="The forecast for the next 7 days is not available right now.">
          It will appear after the next forecast update.
        </EmptyState>
      ) : (
        <section className="rounded-lg border p-4 space-y-3" aria-labelledby="week-title">
          <h2 id="week-title" className="font-semibold">
            Rain in the next {d.forecast.length} days
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Total rain expected</p>
              <p className="text-2xl font-semibold">{total.toFixed(0)} mm</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Dry days ahead (under 1 mm)</p>
              <p className="text-2xl font-semibold">
                {dry} of {d.forecast.length}
              </p>
            </div>
          </div>
          <p className="text-sm">
            {dry === d.forecast.length
              ? "No useful rain is expected this week."
              : total >= 50
                ? "A wet week is expected — good soil moisture, but watch for waterlogging and flooding."
                : dry >= 5
                  ? "Mostly dry this week with only a little rain."
                  : "Some rain is expected on several days this week."}
          </p>
          <ul className="divide-y text-sm">
            {d.forecast.map((f) => (
              <li key={f.date} className="flex items-center justify-between gap-2 py-2">
                <span className="w-24 shrink-0">
                  {weekday(f.date)} {formatDayMonth(f.date)}
                  {f.date === d.today ? " (today)" : ""}
                </span>
                <span className="flex-1 text-muted-foreground">{rainWords(f.rainMm)}</span>
                <span className="tabular-nums font-medium">
                  {f.rainMm == null ? "—" : `${f.rainMm.toFixed(1)} mm`}
                </span>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {f.rainProbPct == null ? "" : `${Math.round(f.rainProbPct)}%`}
                </span>
              </li>
            ))}
          </ul>
          {newest && (
            <p className="text-xs text-muted-foreground">
              Forecast: <DataAge source={newest.source} fetchedAt={newest.fetchedAt} />. Forecasts more
              than 3 days ahead are less certain.
            </p>
          )}
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        Automatic guidance from model data — not an official agricultural or weather advisory.
      </p>
    </div>
  );
}
