# A3 — Public site core agent (home map, place pages, search, widget)

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`, `src/lib/geo/*`
(zones, lookup, search, simplified — built by A1), `src/server/queries/geo.ts`,
`src/db/schema/{geo,weather,alerts,reports}.ts`, `src/lib/weather/{constants,calc,types}.ts`,
`src/components/weather/provenance.tsx`, `src/components/layout/*`,
`src/lib/time.ts`, `src/lib/queue.ts` (sendJob + JOBS.cellActivate),
`src/app/(public)/layout.tsx`, `.env` (NEXT_PUBLIC_MAP_STYLE_URL).

## Mission

The public face: a fast national map home page, place search, the place page
(current conditions, 48 h hourly, 16-day daily, alerts, confidence), and the
embeddable widget. Visitors are mostly on Android phones with slow data —
server-render everything; client islands only for the map, charts and search box.

## You own (write ONLY here)

- `src/app/(public)/page.tsx` (replace the placeholder)
- `src/app/(public)/place/**` — but NOT `climate/`, `history/`, `farming/`
  subfolders of place routes (A4 owns those; create the tab bar linking to them)
- `src/app/widget/**`, `src/app/api/widget/**`, `src/app/api/geo/**`
- `src/components/map/**`, `src/components/forecast/**`, `src/components/search/**`
- `src/server/queries/weather.ts`

Everything else read-only. A4 and A5 are working concurrently in their own
areas — do not touch `src/app/(public)/{alerts,accuracy,reports,about}` or
`src/reports/**` or `src/server/queries/{climate,alerts,reports,accuracy}.ts`.

## Deliverables

1. **Home page** (`/`, revalidate 600): MapLibre map of Nigeria coloured by
   LGA with a layer switcher: rain today / max temp today / rain next 7 days /
   active alerts. Data endpoint `src/app/api/geo/lga-layer/route.ts` returns
   the simplified LGA FeatureCollection joined with per-LGA values for the
   requested layer (via lgas.grid_cell_id → forecast_daily aggregates /
   active alerts count), Cache-Control s-maxage=1800. Choropleth styling via
   MapLibre fill expressions (quantile or fixed breaks; legend required).
   Map is a client component (react-map-gl maplibre export) with the style
   URL from NEXT_PUBLIC_MAP_STYLE_URL; clicking an LGA navigates to its place
   page; hovering shows name + value. Below the map: search box, use-my-location
   button (geolocation → /place/point?lat=&lon=), active-alert count banner,
   and top movers (3 wettest / 3 hottest LGAs today, server-rendered).
   Global `notices` with scope global/home render as a dismissable banner.
2. **Search**: server route `src/app/api/geo/search/route.ts` wrapping
   `searchPlaces` (rate-limit with RATE_LIMITS.search by IP), and a client
   combobox (shadcn command) used on home + header-ish placement on place
   pages. Results show kind badges (State / LGA / Settlement) and navigate.
3. **Place pages** under `src/app/(public)/place/`:
   - Routes: `state/[slug]`, `lga/[slug]`, `settlement/[id]`, `point` (query
     params lat/lon, validated with inNigeriaBbox, rounded to 3 dp).
   - Shared resolver → a PlaceContext { kind, name, breadcrumbs, lat, lon,
     gridCellId, lgaId?, stateId?, zone } (states use their centre cell via
     the state's own centroid → nearest LGA cell; settlements use their LGA's cell).
   - generateStaticParams for all state slugs; LGAs dynamic with
     revalidate 1800. generateMetadata: "<Name> weather forecast" etc.
   - Layout: header block (name, state, zone, active notices for this place),
     tab bar (Forecast | Climate | History | Farming — the last three link to
     A4's subroutes), then Forecast content:
     a. **Now**: nearest-hour row from forecast_hourly (temp, feels-like,
        humidity, wind + direction, cloud, UV, weather-code icon+label) with
        DataAge from fetchedAt; sunrise/sunset for today.
     b. **Active alerts** for the LGA (and state pages: any LGA in state):
        amber/red Alert components with valid window + "automatic advisory,
        not an official warning" line.
     c. **Next 48 hours**: Recharts composed chart (client island; temp line,
        rain bars, labelled in WAT via time.ts) + horizontally scrollable
        hour cards for phones.
     d. **16 days**: one row per day — weekday+date, icon, tmax/tmin, rain mm
        + probability, wind max, ConfidenceBadge via confidenceLabel(lead).
     e. Provenance footer: SourceBadge + fetchedAt age; if the newest
        forecast_daily.fetchedAt is older than 12 h, a visible "showing last
        good data from X ago" Alert (provider-outage rule).
   - **Weather code mapping**: create `src/components/forecast/weather-codes.ts`
     mapping WMO codes → label + lucide icon (sun/cloud-sun/cloud/cloud-rain/
     cloud-lightning/wind etc.). Keep it the single mapping for the app.
   - **Point pages / on-demand cells**: resolve nearest grid cell; if none
     exists or cell inactive, `sendJob(JOBS.cellActivate, {lat, lon})` (fire
     and forget, wrap in try/catch — queue may be empty in dev without worker)
     and render whatever data exists with an explanatory note ("preparing
     detailed forecast for this spot — showing nearest available data") using
     nearest active cell within ~0.3°; never a broken page.
4. **Widget**: `src/app/widget/[kind]/[id]/page.tsx` (kind: state|lga|settlement)
   — a minimal standalone card (no site chrome; its own tiny layout WITHOUT
   the (public) layout): place name, today + next 3 days, link back to the
   full page, NiMet disclaimer line, total payload tiny (no map, no charts).
   Must be embeddable: set headers in `src/app/widget/layout.tsx` via route
   config NOT possible — instead add `src/app/api/widget/embed/route.ts`
   returning a copy-paste iframe snippet (text/plain) and ensure the widget
   page sends `X-Frame-Options`-free headers (add a `headers()` entry scoped
   to /widget in next.config.ts — next.config.ts is frozen; instead put the
   widget under a route handler? NO — simplest: Next does not set XFO by
   default, so just verify nothing blocks framing and note it). On each place
   page add an "Embed" details element showing the iframe snippet.
5. **Queries** `src/server/queries/weather.ts` (server-only): latestHourly(cellId,
   hours), daily16(cellId), nowRow(cellId), activeAlertsForLga(lgaId)/ForState(stateId),
   layerAggregates(layer) for the home map, topMovers(). Every function returns
   values WITH source/fetchedAt so components can render provenance.

## Hard rules

- Server components by default; `"use client"` only for map, charts, search
  combobox, layer switcher. No data fetching in client components — props only.
- All times displayed via `src/lib/time.ts` helpers. All numbers show °C, mm,
  km/h units explicitly.
- Rate-limit the search API. Zod-validate every route-handler input.
- Keep the LGA layer payload lean: no boundary_geojson in page props — only
  via the cached API route.
- Gates you run: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`. You may run
  `pnpm dev` to eyeball pages (seeded dev DB on :5440 has full geography,
  history, normals and forecasts). NEVER: installs, build, integration/e2e.
- Add unit tests for weather-code mapping completeness and any pure helpers
  you write (tests/unit/public/**).

Report back: file list, gates output tails, pages verified in dev (which URLs
you loaded and what rendered), contract friction.
