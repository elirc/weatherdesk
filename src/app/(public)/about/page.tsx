import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { formatDayMonth } from "@/components/climate/lib/doy";
import { formatLagosDate } from "@/lib/time";
import {
  FALSE_START_DRY_DAYS,
  FALSE_START_SCAN_DAYS,
  ONSET_WINDOW_DAYS,
  ONSET_WINDOW_MM,
} from "@/lib/weather/calc";
import {
  DRY_SPELL_DAYS,
  FORECAST_DAYS,
  NORMALS_END_YEAR,
  NORMALS_START_YEAR,
  NORMAL_BANDS,
  RAIN_CALL_PROB_PCT,
  RAINY_DAY_MM,
  confidenceLabel,
} from "@/lib/weather/constants";
import { ONSET_SEARCH_MMDD } from "@/worker/core/normals";
import { listAlertRules, type PublicAlertRule } from "@/server/queries/alerts";

export const metadata: Metadata = {
  title: "About & methods",
  description:
    "Where WeatherDesk data comes from, how forecasts, normals, rainy-season dates and advisories are computed, and their limits. Independent — not affiliated with NiMet.",
  alternates: { canonical: "/about" },
};

const RULE_LABEL: Record<PublicAlertRule["type"], { label: string; unit: string; text: (t: number) => string }> = {
  heavy_rain: { label: "Heavy rain", unit: "mm/day", text: (t) => `Forecast daily rain of ${t} mm or more` },
  heat: { label: "Heat", unit: "°C", text: (t) => `Forecast daily maximum of ${t} °C or more` },
  wind: { label: "Strong wind", unit: "km/h", text: (t) => `Forecast wind gusts of ${t} km/h or more` },
  dry_spell: {
    label: "Dry spell",
    unit: "days",
    text: (t) => `${t} or more days in a row below ${RAINY_DAY_MM} mm during the rainy season`,
  },
};

/** Thresholds are editor-tunable: cached for an hour. */
async function loadRules() {
  "use cache";
  cacheLife("hours");
  return listAlertRules();
}

function leadRange(level: "high" | "medium" | "low"): string {
  const days = Array.from({ length: FORECAST_DAYS }, (_, i) => i + 1).filter((d) => confidenceLabel(d) === level);
  if (!days.length) return "—";
  return days.length === 1 ? `day ${days[0]}` : `days ${days[0]}–${days[days.length - 1]}`;
}

export default async function AboutPage() {
  const rules = await loadRules();
  const searchStart = formatDayMonth(`2001-${ONSET_SEARCH_MMDD}`);

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-6 text-[15px] leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">About WeatherDesk &amp; our methods</h1>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          WeatherDesk is an independent information service. It is not affiliated with, endorsed by or
          a substitute for the Nigerian Meteorological Agency (NiMet). Our advisories are generated
          automatically and are not official weather warnings. For official forecasts and warnings,
          follow NiMet and your state emergency management agency.
        </p>
      </header>

      <section id="sources" className="space-y-2">
        <h2 className="text-lg font-semibold">Where the data comes from</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Forecasts</strong> — <a className="underline" href="https://open-meteo.com/" rel="noopener">Open-Meteo</a>{" "}
            weather model data, refreshed every 6 hours for a 0.1° (~11 km) grid covering every LGA,
            {` ${FORECAST_DAYS}`} days ahead.
          </li>
          <li>
            <strong>Observed history and climate normals</strong> —{" "}
            <a className="underline" href="https://power.larc.nasa.gov/" rel="noopener">NASA POWER</a> daily
            data. The most recent days are first filled with a model estimate (labelled{" "}
            <em>preliminary</em>) and replaced by NASA POWER values when they are published, usually
            within a few days.
          </li>
          <li>
            <strong>Boundaries</strong> — states and LGAs from{" "}
            <a className="underline" href="https://www.geoboundaries.org/" rel="noopener">geoBoundaries</a>; settlement
            names and locations from <a className="underline" href="https://grid3.org/" rel="noopener">GRID3</a>.
          </li>
          <li>
            <strong>Base maps</strong> — ©{" "}
            <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noopener">
              OpenStreetMap
            </a>{" "}
            contributors.
          </li>
        </ul>
      </section>

      <section id="limits" className="space-y-2">
        <h2 className="text-lg font-semibold">Model data is not a weather station</h2>
        <p>
          Every number on WeatherDesk is for an ~11 km grid square, not for a single street or farm.
          Model and satellite estimates smooth out local effects: a thunderstorm can soak one town and
          miss the next, hills and the coast change temperatures over short distances, and short heavy
          downpours are often underestimated. Treat values as a guide for the area, not a measurement
          at your exact spot. Our{" "}
          <Link href="/accuracy" className="underline">
            accuracy page
          </Link>{" "}
          shows how forecasts compared with observations.
        </p>
      </section>

      <section id="confidence" className="space-y-2">
        <h2 className="text-lg font-semibold">Confidence labels</h2>
        <p>Forecasts become less certain the further ahead they look. Each forecast day carries a label:</p>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="py-1.5 pr-3 font-medium">High confidence</td>
              <td className="py-1.5 pr-3">{leadRange("high")} ahead</td>
              <td className="py-1.5 text-muted-foreground">Usually reliable for planning.</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-medium">Medium confidence</td>
              <td className="py-1.5 pr-3">{leadRange("medium")} ahead</td>
              <td className="py-1.5 text-muted-foreground">Good for the general picture; details may change.</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 font-medium">Low confidence</td>
              <td className="py-1.5 pr-3">{leadRange("low")} ahead</td>
              <td className="py-1.5 text-muted-foreground">Trends only; check again closer to the day.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="alerts" className="space-y-2">
        <h2 className="text-lg font-semibold">Advisory thresholds</h2>
        <p>
          An automatic advisory is issued for an LGA when the forecast for its grid cell crosses one of
          these thresholds. Editors can tune them; the table shows the values in use now.
        </p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No advisory rules are configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Advisory</th>
                  <th className="py-2 pr-3 font-medium">Issued when</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 font-medium">{RULE_LABEL[r.type].label}</td>
                    <td className="py-1.5 pr-3">{RULE_LABEL[r.type].text(r.threshold)}</td>
                    <td className="py-1.5 pr-3">{r.severity}</td>
                    <td className="py-1.5">
                      {r.enabled ? "active" : "paused"}
                      <span className="block text-xs text-muted-foreground">updated {formatLagosDate(r.updatedAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="season" className="space-y-2">
        <h2 className="text-lg font-semibold">Rainy season onset and cessation</h2>
        <p>
          <strong>Onset</strong> (the rains have started): searching from {searchStart} each year, the
          first day on which at least {ONSET_WINDOW_MM} mm of rain falls within {ONSET_WINDOW_DAYS}{" "}
          days, provided the following {FALSE_START_SCAN_DAYS} days contain no dry spell of{" "}
          {FALSE_START_DRY_DAYS} days or more (otherwise it was a false start and the search
          continues).
        </p>
        <p>
          <strong>Cessation</strong> (the rains have ended): the last day of the final{" "}
          {ONSET_WINDOW_DAYS}-day spell with at least {ONSET_WINDOW_MM} mm in the season.
        </p>
        <p>
          <strong>Typical dates</strong> are the median onset and cessation over past years
          ({NORMALS_START_YEAR}–{NORMALS_END_YEAR} where data allows), shown as “around 12 April”.
        </p>
        <p>
          Other definitions used everywhere: a <strong>rainy day</strong> has {RAINY_DAY_MM.toFixed(1)} mm
          or more; a <strong>dry spell</strong> is {DRY_SPELL_DAYS} or more consecutive days below that;
          rainfall is <strong>below normal</strong> under {NORMAL_BANDS.belowPct}% of the{" "}
          {NORMALS_START_YEAR}–{NORMALS_END_YEAR} average, <strong>above normal</strong> over{" "}
          {NORMAL_BANDS.abovePct}%, and near normal in between. For accuracy scoring a forecast counts
          as “rain” when the chance of rain is {RAIN_CALL_PROB_PCT}% or more.
        </p>
      </section>

      <section id="plans" className="space-y-2">
        <h2 className="text-lg font-semibold">Free for personal use</h2>
        <p>
          The website, place pages, history and reports are free for personal and non-commercial
          use. Businesses, NGOs and agencies that need the API, branded reports, custom areas or SMS
          and WhatsApp delivery can choose a paid plan.
        </p>
      </section>

      <section id="contact" className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Questions, corrections or partnership enquiries: <span className="font-mono">hello@weatherdesk.example</span>{" "}
          (placeholder address).
        </p>
      </section>
    </article>
  );
}
