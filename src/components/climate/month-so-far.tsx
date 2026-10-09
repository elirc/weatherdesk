import { cacheLife } from "next/cache";
import { DataAge, SourceBadge } from "@/components/weather/provenance";
import { addDaysIso, lagosToday } from "@/lib/time";
import { getMonthlyNormals, getObservedRange } from "@/server/queries/climate";
import { monthName } from "./lib/doy";
import { computeMonthSoFar, formatAnomalyC, type MonthSoFar as MonthSoFarData } from "./lib/month-so-far";

/**
 * "This month so far" — self-contained server component (fetches its own
 * data, cached ~1 h). Used on the climate tab; exported so A3's forecast
 * tab can drop it in later: <MonthSoFar gridCellId={place.gridCellId} />.
 */

type Loaded = { data: MonthSoFarData; updatedAt: Date | null; monthLabel: string } | null;

async function loadMonthSoFar(gridCellId: number): Promise<Loaded> {
  "use cache";
  cacheLife("hours");
  const today = lagosToday();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const yesterday = addDaysIso(today, -1);
  if (yesterday < monthStart) {
    // 1st of the month — nothing observed yet this month
    return null;
  }
  const [rows, normals] = await Promise.all([
    getObservedRange(gridCellId, monthStart, yesterday),
    getMonthlyNormals(gridCellId),
  ]);
  const normal = normals.find((n) => n.month === Number(month.slice(5, 7))) ?? null;
  const data = computeMonthSoFar(month, rows, normal);
  const updatedAt = rows.reduce<Date | null>((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
  return { data, updatedAt, monthLabel: `${monthName(Number(month.slice(5, 7)))} ${month.slice(0, 4)}` };
}

const bandStyle: Record<string, string> = {
  "above normal": "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  "near normal": "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "below normal": "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
};

export async function MonthSoFar({ gridCellId }: { gridCellId: number | null }) {
  const loaded = gridCellId != null ? await loadMonthSoFar(gridCellId) : null;
  return (
    <section className="rounded-lg border p-4 space-y-3" aria-labelledby="msf-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="msf-title" className="font-semibold">
          This month so far{loaded ? ` · ${loaded.monthLabel}` : ""}
        </h2>
        {loaded && loaded.data.daysCovered > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {loaded.data.sources.map((s) => (
              <SourceBadge key={s} source={s} preliminary={s === "model_estimate" && loaded.data.preliminary} />
            ))}
          </span>
        )}
      </div>
      {!loaded || loaded.data.daysCovered === 0 ? (
        <p className="text-sm text-muted-foreground">
          No observed days yet this month. Figures appear from the 2nd of the month, once the first
          day has been measured.
        </p>
      ) : (
        <MonthSoFarBody data={loaded.data} updatedAt={loaded.updatedAt} />
      )}
    </section>
  );
}

function MonthSoFarBody({ data, updatedAt }: { data: MonthSoFarData; updatedAt: Date | null }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        1–{data.daysCovered} of {data.daysInMonth} days, compared with the 1991–2020 normal for the
        same number of days.
        {data.nMissing > 0 && ` ${data.nMissing} day${data.nMissing === 1 ? "" : "s"} missing.`}
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Rain so far</dt>
          <dd className="text-xl font-semibold">{data.rainTotalMm.toFixed(1)} mm</dd>
          <dd className="text-xs text-muted-foreground">
            normal to date {data.normalToDateMm != null ? `${data.normalToDateMm.toFixed(1)} mm` : "—"}
          </dd>
          {data.band && (
            <dd className="mt-1">
              <span className={`rounded px-1.5 py-0.5 text-xs ${bandStyle[data.band]}`}>
                {data.rainPctOfNormal}% · {data.band}
              </span>
            </dd>
          )}
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Rainy days (≥ 1 mm)</dt>
          <dd className="text-xl font-semibold">{data.rainyDays}</dd>
          <dd className="text-xs text-muted-foreground">
            normal to date {data.normalRainyDaysToDate != null ? data.normalRainyDaysToDate.toFixed(1) : "—"}
          </dd>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Average max temperature</dt>
          <dd className="text-xl font-semibold">
            {data.meanTmaxC != null ? `${data.meanTmaxC.toFixed(1)} °C` : "—"}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {formatAnomalyC(data.tmaxAnomalyC)} vs normal
            {data.normalTmaxC != null ? ` (${data.normalTmaxC.toFixed(1)} °C)` : ""}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {data.preliminary
          ? "The most recent days are preliminary model estimates and are replaced by NASA POWER values when available. "
          : ""}
        {updatedAt && <DataAge source={data.sources.includes("nasa_power") ? "nasa-power" : data.sources[0] ?? "computed"} fetchedAt={updatedAt} />}
      </p>
    </>
  );
}
