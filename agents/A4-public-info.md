# A4 — Public info agent (climate, history, alerts, accuracy, reports pages, SEO)

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`,
`src/db/schema/{geo,weather,alerts,reports,ops}.ts`,
`src/lib/weather/{constants,calc,types}.ts`, `src/lib/geo/*` (A1's lookup/
search/simplified), `src/components/weather/provenance.tsx`, `src/lib/time.ts`,
`src/lib/authz.ts`, `src/reports/generate.ts` (types only), the reports.content
JSON shape documented in `agents/A5-reports.md` §"content JSON contract".

## Mission

The information layer of the public site: climate + history + farming tabs on
place pages, month-so-far, the alerts page, the accuracy page, the reports
archive and report web view, about/methods, sitemap + SEO.

## You own (write ONLY here)

- `src/app/(public)/place/**` ONLY the `climate/`, `history/`, `farming/`
  subfolders (A3 owns the rest of place/** and builds the tab bar that links
  to you; coordinate via route structure only: your pages live at
  `place/<kind>/<slug>/climate` etc. — mirror A3's segment layout exactly;
  if A3's resolver file `src/app/(public)/place/resolve.ts` exists, import
  it; otherwise write your own under your folders and note the duplication)
- `src/app/(public)/alerts/**`, `src/app/(public)/accuracy/**`,
  `src/app/(public)/reports/**`, `src/app/(public)/about/**`
- `src/app/sitemap.ts`, `src/app/robots.ts`
- `src/app/api/downloads/**` (history CSV)
- `src/server/queries/{climate,alerts,reports,accuracy}.ts`
- `src/components/climate/**`, `src/components/history/**`
- `tests/unit/info/**`

Concurrent agents: A3 in place/** root + map/forecast components; A5 in
src/reports/**. Do not write in their areas.

## Deliverables

1. **Climate tab** (`place/.../climate`, revalidate 86400): monthly normals
   bar+line chart (rain bars, tmax/tmin lines; Recharts client island),
   normals table, typical season card: onset/cessation as "around 12 April" /
   "around 20 October" (DOY → date via a leap-safe helper; write unit tests),
   season length. Source: normals_monthly + normals_season for the place's
   grid cell. Note "Normals 1991–2020, NASA POWER" with SourceBadge.
2. **This month so far** (component on the climate tab AND exported for A3's
   forecast tab via `src/components/climate/month-so-far.tsx` — A3 does NOT
   import it yet; just build it self-contained): observed_daily rows for the
   current Lagos month vs normals_monthly pro-rated to the same day count:
   rain total vs normal-to-date (percentOfNormal + classifyNormalBand),
   rainy days, mean tmax anomaly. Preliminary rows → "preliminary" badge.
3. **History tab** (`place/.../history`): date-range picker (default last 12
   months; min 1991-01-01, max today-1), chart (daily rain bars + tmax line)
   and a paginated table (TanStack Table, 31/page). Server component fetches
   via searchParams (from/to validated with Zod); CSV download button hits
   `src/app/api/downloads/history.csv?cell=..&from=..&to=..` which REQUIRES a
   signed-in user (`requireUser`; on AuthzError redirect to /sign-in?next=...)
   — free account is enough. Stream CSV with proper headers; include source
   + preliminary columns.
4. **Farming tab** (`place/.../farming`, revalidate 3600): rain expected next
   7 days (sum + per-day mm from forecast_daily), dry days ahead (count <1mm),
   "have the rains started?" — compare this season's observed onset
   (detectOnset over observed_daily from Feb/Apr search start) against the
   normal onset (normals_season); states: started on <date> (n days
   early/late) / not yet — normally around <date> / season over. Plain-language
   sentences; this page is for farmers on phones.
5. **Alerts page** (`/alerts`, revalidate 300): map of Nigeria with LGAs that
   have active alerts coloured by severity (reuse A3's `src/app/api/geo/lga-layer`
   route with layer=alerts if available, else build a small dedicated GeoJSON
   endpoint under your queries + a lightweight MapLibre island of your own in
   src/components/climate/ namespace), plus a grouped list (by state) of
   active alerts with type icon, LGA, window (WAT), text. Empty state: "No
   active advisories." Disclaimer banner. Notices with scope 'alerts' shown.
6. **Accuracy page** (`/accuracy`, revalidate 86400): methodology paragraph
   (plain language), then per-zone × lead-day table/heatmap of MAE tmax and
   rain hit-rate from accuracy_stats (latest 3 full months aggregated,
   weighted by nSamples), a Recharts line of hit-rate vs lead day, and a
   month selector (searchParam). Must render a friendly empty state when
   accuracy_stats is sparse (fresh install).
7. **Reports pages**:
   - `/reports` archive: filters (type, scope: national/state, year), list
     grouped by period showing status (preliminary/final), published date,
     link to web view + PDF.
   - `/reports/[id]`: web rendering of reports.content per the content JSON
     contract in A5's brief §"content JSON contract" (headline, period, maps
     as inline SVG strings from content.svgs — render with
     dangerouslySetInnerHTML inside a sanitizing wrapper that you own; state/
     LGA table with percent-of-normal bands coloured; alerts issued;
     outlook; methods note; correctionNote callout when present). PDF button
     → `/reports/[id]/pdf` route handler streaming from the storage adapter
     (`getStorageAdapter().get(report.pdfKey)`), 404-safe.
   - Only `status != 'draft' AND publishedAt IS NOT NULL` reports are visible;
     org-branded copies (organizationId set) are NEVER listed publicly.
8. **About & methods** (`/about`): sources (Open-Meteo, NASA POWER,
   geoBoundaries, GRID3, OSM), model-vs-station limits, confidence labels
   meaning, alert thresholds table (read live from alert_rules), season
   onset/cessation definitions (quote the constants from calc.ts), the NiMet
   independence statement, non-commercial→paid plan note, contact placeholder.
9. **SEO**: `src/app/sitemap.ts` — home, alerts, accuracy, reports, about,
   every state page, every LGA page (~820 URLs, from geo queries; set
   changeFrequency/priority sensibly). robots.ts allows all, points at the
   sitemap, disallows /staff, /dashboard, /org, /api.
10. **Unit tests** (run): DOY→date helper (leap years), month-so-far pro-rating
    math, CSV row formatting, accuracy aggregation weighting.

## Hard rules

- Server components except charts/map islands. Everything provenance-labelled
  (SourceBadge/DataAge), Lagos times via time.ts, °C/mm/km/h units explicit.
- Zod-validate all searchParams; clamp date ranges (max 5 years per request).
- Friendly empty states everywhere (fresh DB must not 500).
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`; `pnpm dev` to
  eyeball. NEVER installs/build/integration/e2e.

Report back: file list, gates output tails, URLs verified in dev, contract friction.
