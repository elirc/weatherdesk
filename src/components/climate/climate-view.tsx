import Link from "next/link";
import { cacheLife } from "next/cache";
import type { PlaceContext } from "@/app/(public)/place/resolve";
import { SourceBadge } from "@/components/weather/provenance";
import { NORMALS_END_YEAR, NORMALS_START_YEAR } from "@/lib/weather/constants";
import {
  getMonthlyNormals,
  getSeasonNormal,
  type MonthlyNormal,
  type SeasonNormal,
} from "@/server/queries/climate";
import { EmptyState, InfoHeader } from "./info-header";
import { aroundDate, monthShort, monthName } from "./lib/doy";
import { MonthSoFar } from "./month-so-far";
import { NormalsChart } from "./normals-chart";

/** Climate tab. Normals are cached for a day (they only change on re-seed). */

async function loadNormals(cellId: number): Promise<{ monthly: MonthlyNormal[]; season: SeasonNormal | null }> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 86400, expire: 7 * 86400 });
  const [monthly, season] = await Promise.all([getMonthlyNormals(cellId), getSeasonNormal(cellId)]);
  return { monthly, season };
}

const fmt = (v: number | null, unit: string, dp = 1) => (v == null ? "—" : `${v.toFixed(dp)} ${unit}`);

export async function ClimateView({ place }: { place: PlaceContext }) {
  const normals = place.gridCellId != null ? await loadNormals(place.gridCellId) : null;
  const period = `${NORMALS_START_YEAR}–${NORMALS_END_YEAR}`;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <InfoHeader place={place} tab="climate" />
      <MonthSoFar gridCellId={place.gridCellId} />
      {!normals || normals.monthly.length === 0 ? (
        <EmptyState title="Climate normals are not available here yet.">
          Normals are computed from NASA POWER daily history; they appear once the history backfill
          for this area has finished.
        </EmptyState>
      ) : (
        <>
          <SeasonCard season={normals.season} />
          <section className="space-y-2 rounded-lg border p-4" aria-labelledby="normals-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="normals-title" className="font-semibold">
                Monthly normals
              </h2>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Normals {period}, NASA POWER <SourceBadge source="nasa-power" />
              </span>
            </div>
            <NormalsChart
              data={normals.monthly.map((m) => ({
                label: monthShort(m.month),
                rainMm: m.rainMm,
                tmaxC: m.tmaxC,
                tminC: m.tminC,
              }))}
            />
            <NormalsTable rows={normals.monthly} />
            <p className="text-xs text-muted-foreground">
              Averages over {period} for the ~11 km grid cell covering this place. Model/satellite
              estimates, not a weather-station record.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function SeasonCard({ season }: { season: SeasonNormal | null }) {
  const onset = aroundDate(season?.onsetDoy);
  const cessation = aroundDate(season?.cessationDoy);
  return (
    <section className="rounded-lg border p-4 space-y-2" aria-labelledby="season-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="season-title" className="font-semibold">
          Typical rainy season
        </h2>
        <SourceBadge source="nasa-power" />
      </div>
      {!onset && !cessation ? (
        <p className="text-sm text-muted-foreground">
          Not enough years of rainfall history to estimate typical season dates here yet.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">Rains usually start</dt>
            <dd className="text-lg font-semibold">{onset ?? "—"}</dd>
          </div>
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">Rains usually end</dt>
            <dd className="text-lg font-semibold">{cessation ?? "—"}</dd>
          </div>
          <div className="rounded-md bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">Season length</dt>
            <dd className="text-lg font-semibold">
              {season?.seasonLengthDays != null ? `about ${season.seasonLengthDays} days` : "—"}
            </dd>
          </div>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Median dates over past years using the agronomic onset rule explained on the{" "}
        <Link href="/about#season" className="underline">
          About page
        </Link>
        .
      </p>
    </section>
  );
}

function NormalsTable({ rows }: { rows: MonthlyNormal[] }) {
  const totalRain = rows.reduce((s, r) => s + (r.rainMm ?? 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">Monthly climate normals</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Month</th>
            <th className="py-2 pr-2 text-right font-medium">Rain</th>
            <th className="py-2 pr-2 text-right font-medium">Rainy days</th>
            <th className="py-2 pr-2 text-right font-medium">Max temp</th>
            <th className="py-2 text-right font-medium">Min temp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b last:border-0">
              <td className="py-1.5 pr-2">{monthName(r.month)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.rainMm, "mm")}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.rainyDays == null ? "—" : r.rainyDays.toFixed(1)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.tmaxC, "°C")}</td>
              <td className="py-1.5 text-right tabular-nums">{fmt(r.tminC, "°C")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-xs text-muted-foreground">
            <td className="pt-2">Year</td>
            <td className="pt-2 text-right tabular-nums">{totalRain.toFixed(0)} mm</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
