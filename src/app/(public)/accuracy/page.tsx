import { Suspense } from "react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { z } from "zod";
import { AccuracyChart, type AccuracySeries } from "@/components/climate/accuracy-chart";
import { EmptyState } from "@/components/climate/info-header";
import {
  MIN_SAMPLES_TO_SHOW,
  aggregateAccuracy,
  latestFullMonths,
  type AccuracyCell,
} from "@/components/climate/lib/accuracy-aggregate";
import { monthName } from "@/components/climate/lib/doy";
import { DataAge } from "@/components/weather/provenance";
import { ZONES, ZONE_LABELS } from "@/lib/geo/zones";
import { ARCHIVE_LEAD_DAYS, RAIN_CALL_PROB_PCT, RAINY_DAY_MM } from "@/lib/weather/constants";
import { lagosToday } from "@/lib/time";
import { getAccuracyComputedAt, getAccuracyRows, listAccuracyMonths } from "@/server/queries/accuracy";

export const metadata: Metadata = {
  title: "Forecast accuracy",
  description:
    "How accurate are WeatherDesk forecasts? Temperature error and rain hit rate by zone and days ahead, checked against observed data.",
  alternates: { canonical: "/accuracy" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

const monthParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);

const ZONE_ORDER = ["national", ...ZONES] as const;
const ZONE_COLORS: Record<string, string> = {
  national: "#111827",
  "north-west": "#2563eb",
  "north-east": "#7c3aed",
  "north-central": "#059669",
  "south-west": "#d97706",
  "south-east": "#dc2626",
  "south-south": "#0891b2",
};
const zoneLabel = (z: string) => (z === "national" ? "Nigeria" : (ZONE_LABELS as Record<string, string>)[z] ?? z);
const monthLabel = (m: string) => `${monthName(Number(m.slice(5, 7)))} ${m.slice(0, 4)}`;

/** Cached for a day (replaces segment revalidate = 86400). */
async function loadAccuracy(selected: string | null) {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 86400, expire: 7 * 86400 });
  const available = await listAccuracyMonths();
  const currentMonthStart = `${lagosToday().slice(0, 7)}-01`;
  const months =
    selected && available.includes(`${selected}-01`) ? [`${selected}-01`] : latestFullMonths(available, currentMonthStart, 3);
  const [rows, computedAt] = await Promise.all([getAccuracyRows(months), getAccuracyComputedAt(months)]);
  return { available, months, cells: aggregateAccuracy(rows), computedAt, currentMonthStart };
}

export default function AccuracyPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Forecast accuracy</h1>
        <div className="max-w-3xl space-y-2 text-sm text-muted-foreground">
          <p>
            Every day we keep a copy of the forecast made 1, 2, 3, 5, 7, 10 and 14 days ahead. When
            the day has passed, we compare it with what was observed for the same ~11 km grid cell
            (NASA POWER daily data). We publish two simple scores per region:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Max temperature error</strong> — on average, how many °C the forecast daily
              maximum was off (lower is better).
            </li>
            <li>
              <strong>Rain hit rate</strong> — the share of days where the forecast got “rain or no
              rain” right. A day counts as a rain forecast when the chance of rain was{" "}
              {RAIN_CALL_PROB_PCT}% or more, and as rainy when {RAINY_DAY_MM.toFixed(0)} mm or more
              fell (higher is better).
            </li>
          </ul>
          <p>
            Scores combine all grid cells in a zone, weighted by the number of forecast–observation
            pairs. Observations are themselves model/satellite estimates, not rain-gauge readings.
          </p>
        </div>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-muted" />}>
        <AccuracyBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccuracyBody({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const selected = monthParam.parse(raw) ?? null;
  const d = await loadAccuracy(selected);
  const shown = d.cells.filter((c) => c.nSamples >= MIN_SAMPLES_TO_SHOW);
  const isDefault = !(selected && d.months.length === 1 && d.months[0] === `${selected}-01`);

  const selector = (
    <nav aria-label="Months" className="flex flex-wrap gap-2 text-sm">
      <Link
        href="/accuracy"
        aria-current={isDefault ? "page" : undefined}
        className={`rounded-full border px-3 py-1 ${isDefault ? "bg-foreground text-background" : "hover:bg-muted"}`}
      >
        Latest 3 full months
      </Link>
      {[...d.available].reverse().map((m) => {
        const key = m.slice(0, 7);
        const active = !isDefault && selected === key;
        return (
          <Link
            key={m}
            href={`/accuracy?month=${key}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            {monthLabel(m)}
            {m >= d.currentMonthStart ? " (so far)" : ""}
          </Link>
        );
      })}
    </nav>
  );

  if (shown.length === 0) {
    return (
      <div className="space-y-4">
        {d.available.length > 0 && selector}
        <EmptyState title="Not enough verified forecasts yet.">
          Accuracy scores appear once forecasts have been archived and the matching days observed —
          usually after the first full month of operation.
          {d.available.length > 0 && " Try another month above."}
        </EmptyState>
      </div>
    );
  }

  const zones = ZONE_ORDER.filter((z) => shown.some((c) => c.zone === z));
  const leads = [...ARCHIVE_LEAD_DAYS].filter((l) => shown.some((c) => c.leadDays === l));
  const cell = (z: string, l: number) => shown.find((c) => c.zone === z && c.leadDays === l);
  const series: AccuracySeries[] = zones.map((z) => ({
    key: z,
    label: zoneLabel(z),
    color: ZONE_COLORS[z] ?? "#6b7280",
    bold: z === "national",
  }));
  const chartData = leads.map((l) => {
    const row: Record<string, number | null> = { lead: l };
    for (const z of zones) {
      const c = cell(z, l);
      row[z] = c?.rainHitRate != null ? Math.round(c.rainHitRate * 1000) / 10 : null;
    }
    return row;
  });
  const totalSamples = shown.filter((c) => c.zone === "national").reduce((s, c) => s + c.nSamples, 0);

  return (
    <div className="space-y-6">
      {selector}
      <p className="text-sm text-muted-foreground">
        Showing {d.months.map(monthLabel).join(", ")}
        {totalSamples > 0 && ` · ${totalSamples.toLocaleString("en-NG")} national forecast–observation pairs`}
        {d.computedAt && (
          <>
            {" · "}
            <DataAge source="computed" fetchedAt={d.computedAt} />
          </>
        )}
      </p>

      <section aria-labelledby="chart-title" className="rounded-lg border p-4">
        <h2 id="chart-title" className="mb-2 font-semibold">
          Rain hit rate by days ahead
        </h2>
        <AccuracyChart data={chartData} series={series} />
      </section>

      <HeatTable
        title="Max temperature error (°C, lower is better)"
        zones={zones}
        leads={leads}
        get={(z, l) => cell(z, l)}
        value={(c) => c.maeTmax}
        format={(v) => v.toFixed(1)}
        color={(v) => maeColor(v)}
      />
      <HeatTable
        title="Rain hit rate (% of days right, higher is better)"
        zones={zones}
        leads={leads}
        get={(z, l) => cell(z, l)}
        value={(c) => (c.rainHitRate == null ? null : c.rainHitRate * 100)}
        format={(v) => `${v.toFixed(0)}%`}
        color={(v) => hitColor(v)}
      />
      <p className="text-xs text-muted-foreground">
        Cells with fewer than {MIN_SAMPLES_TO_SHOW} pairs are hidden. Forecast source: Open-Meteo;
        observations: NASA POWER.
      </p>
    </div>
  );
}

function maeColor(v: number): string {
  if (v <= 1) return "bg-emerald-100 dark:bg-emerald-950";
  if (v <= 2) return "bg-lime-100 dark:bg-lime-950";
  if (v <= 3) return "bg-amber-100 dark:bg-amber-950";
  return "bg-rose-100 dark:bg-rose-950";
}

function hitColor(v: number): string {
  if (v >= 85) return "bg-emerald-100 dark:bg-emerald-950";
  if (v >= 75) return "bg-lime-100 dark:bg-lime-950";
  if (v >= 65) return "bg-amber-100 dark:bg-amber-950";
  return "bg-rose-100 dark:bg-rose-950";
}

function HeatTable({
  title,
  zones,
  leads,
  get,
  value,
  format,
  color,
}: {
  title: string;
  zones: readonly string[];
  leads: number[];
  get: (z: string, l: number) => AccuracyCell | undefined;
  value: (c: AccuracyCell) => number | null;
  format: (v: number) => string;
  color: (v: number) => string;
}) {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 pr-2 text-left font-medium">Region</th>
              {leads.map((l) => (
                <th key={l} className="py-2 px-1 text-center font-medium">
                  {l} day{l === 1 ? "" : "s"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z} className={`border-b last:border-0 ${z === "national" ? "font-medium" : ""}`}>
                <td className="py-1.5 pr-2">{zoneLabel(z)}</td>
                {leads.map((l) => {
                  const c = get(z, l);
                  const v = c ? value(c) : null;
                  return (
                    <td key={l} className="px-1 py-1 text-center tabular-nums">
                      {v == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`block rounded px-1 py-1 ${color(v)}`} title={`${c?.nSamples ?? 0} pairs`}>
                          {format(v)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
