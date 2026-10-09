import { cacheLife } from "next/cache";
import type { PlaceContext } from "@/app/(public)/place/resolve";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DataAge, SourceBadge } from "@/components/weather/provenance";
import { EmptyState, InfoHeader, tabHref } from "@/components/climate/info-header";
import { addDaysIso, lagosToday } from "@/lib/time";
import { periodStats } from "@/lib/weather/calc";
import { getObservedRange } from "@/server/queries/climate";
import { HistoryChart, type HistoryPoint } from "./history-chart";
import { HistoryTable, type HistoryRow } from "./history-table";
import { HISTORY_MIN_DATE, MAX_RANGE_YEARS, defaultFrom, resolveHistoryRange } from "./range";

/** History tab: GET form range picker (no JS needed), chart, paginated table, CSV link. */

async function loadHistory(cellId: number, from: string, to: string) {
  "use cache";
  cacheLife("hours");
  const rows = await getObservedRange(cellId, from, to);
  const updatedAt = rows.reduce<Date | null>((a, r) => (!a || r.updatedAt > a ? r.updatedAt : a), null);
  return {
    rows: rows.map(
      (r): HistoryRow => ({
        date: r.date,
        rainMm: r.rainMm,
        tmaxC: r.tmaxC,
        tminC: r.tminC,
        source: r.source,
        preliminary: r.preliminary,
      }),
    ),
    updatedAt,
  };
}

export async function HistoryView({
  place,
  searchParams,
}: {
  place: PlaceContext;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const today = lagosToday();
  const range = resolveHistoryRange(searchParams, today);
  const maxDate = addDaysIso(today, -1);
  const base = tabHref(place, "history");
  const presets = [
    { label: "Last 30 days", from: addDaysIso(maxDate, -29), to: maxDate },
    { label: "Last 12 months", from: defaultFrom(maxDate), to: maxDate },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: maxDate },
    { label: `Last ${MAX_RANGE_YEARS} years`, from: addDaysIso(maxDate, -(MAX_RANGE_YEARS * 365 - 1)), to: maxDate },
  ];

  const data = place.gridCellId != null ? await loadHistory(place.gridCellId, range.from, range.to) : null;
  const stats = data ? periodStats(data.rows) : null;
  const anyPrelim = data?.rows.some((r) => r.preliminary) ?? false;
  const csvHref =
    place.gridCellId != null
      ? `/api/downloads/history.csv?cell=${place.gridCellId}&from=${range.from}&to=${range.to}`
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <InfoHeader place={place} tab="history" />

      <form method="get" action={base} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            min={HISTORY_MIN_DATE}
            max={maxDate}
            className="rounded-md border bg-background px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            min={HISTORY_MIN_DATE}
            max={maxDate}
            className="rounded-md border bg-background px-2 py-1.5"
          />
        </label>
        <Button type="submit" size="sm">
          Show
        </Button>
        <div className="flex w-full flex-wrap gap-x-3 gap-y-1 text-xs">
          {presets.map((p) => (
            <Link key={p.label} href={`${base}?from=${p.from}&to=${p.to}`} className="text-muted-foreground underline hover:text-foreground">
              {p.label}
            </Link>
          ))}
        </div>
        {range.clamped && (
          <p className="w-full text-xs text-amber-700 dark:text-amber-300">
            The range was adjusted: history is available from 1 January 1991 up to yesterday, at most{" "}
            {MAX_RANGE_YEARS} years at a time.
          </p>
        )}
      </form>

      {!data || data.rows.length === 0 ? (
        <EmptyState title="No observed data for this period.">
          Daily history is filled in from NASA POWER as the backfill progresses. Try a more recent
          range.
        </EmptyState>
      ) : (
        <>
          <section className="space-y-3 rounded-lg border p-4" aria-labelledby="hist-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="hist-title" className="font-semibold">
                {range.from} to {range.to}
              </h2>
              <span className="flex items-center gap-1">
                <SourceBadge source="nasa-power" />
                {anyPrelim && <SourceBadge source="model_estimate" preliminary />}
              </span>
            </div>
            {stats && (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Total rain</dt>
                  <dd className="font-semibold">{stats.rainTotalMm.toFixed(1)} mm</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rainy days (≥ 1 mm)</dt>
                  <dd className="font-semibold">{stats.rainyDays}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Average max</dt>
                  <dd className="font-semibold">{stats.meanTmaxC == null ? "—" : `${stats.meanTmaxC.toFixed(1)} °C`}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Wettest day</dt>
                  <dd className="font-semibold">{stats.maxRainDayMm == null ? "—" : `${stats.maxRainDayMm.toFixed(1)} mm`}</dd>
                </div>
              </dl>
            )}
            <HistoryChart points={data.rows.map((r): HistoryPoint => [r.date, r.rainMm, r.tmaxC])} />
            {data.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated <DataAge source="nasa-power" fetchedAt={data.updatedAt} />
                {anyPrelim && " · recent days are preliminary model estimates"}
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-lg border p-4" aria-labelledby="table-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="table-title" className="font-semibold">
                Daily values ({data.rows.length} days)
              </h2>
              {csvHref && (
                <Button asChild variant="outline" size="sm">
                  <a href={csvHref} rel="nofollow">
                    Download CSV
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">CSV download needs a free account.</p>
            <HistoryTable key={`${range.from}_${range.to}`} rows={data.rows} />
          </section>
        </>
      )}
    </div>
  );
}
