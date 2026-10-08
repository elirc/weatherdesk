# A1 — Geography & seed agent

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`, `src/db/schema/geo.ts`,
`src/db/schema/weather.ts`, `src/db/schema/alerts.ts`, `src/db/schema/billing.ts`,
`src/lib/geo/zones.ts`, `src/lib/weather/{constants,calc}.ts`,
`src/adapters/mock/climate.ts`, `src/lib/time.ts`, `src/lib/ids.ts`, `src/lib/auth.ts`.

## Mission

Everything geographic plus the seed framework: load Nigeria's 37 states and
774 LGAs with PostGIS geometries from the committed geoBoundaries files,
create grid cells, settlements, demo users/org, plans, alert rules, and (mock
mode) two years of observed history + normals so the site is fully usable
after `pnpm seed`.

## You own (write ONLY here)

- `scripts/**` (except `scripts/seed-steps/70-reports.ts` — reserved for A5; create the folder and numbering convention)
- `src/lib/geo/**` except `zones.ts` (you may ADD exports to zones.ts but never change existing ones)
- `src/server/queries/geo.ts`
- `data/settlements/**`, `data/derived/**`, `docs/DATA.md`
- `tests/unit/geo/**`, `tests/integration/geo.test.ts`

Everything else is read-only. Do NOT touch package.json, src/db, src/adapters,
other agents' areas. Needed deps are installed (@turf/turf, pg, drizzle-orm, tsx, dotenv).

## Deliverables

1. **Seed framework** `scripts/seed.ts`: runs numbered steps from
   `scripts/seed-steps/` in order (10-geography, 20-grid, 30-settlements,
   40-plans, 45-alert-rules, 50-users, 60-history-normals, 70-reports [skip
   with a warning if its file is missing]). Steps are idempotent (safe re-run;
   upsert or skip-if-present). `tsx scripts/seed.ts` with `import "dotenv/config"`.
   Each step logs name + row counts + duration.
2. **Geography** (`scripts/seed-steps/10-geography.ts` + helpers in `scripts/lib/`):
   - Parse `data/boundaries/raw/nga-adm1-simplified.geojson` (37 states) and
     `nga-adm2-simplified.geojson` (774 LGAs). Properties: `shapeName`, `shapeISO`, `shapeID`.
   - States: map `shapeName` → zone via `STATE_ZONES` and code via `STATE_CODES`
     (handle "Abuja Federal Capital Territory"/"Federal Capital Territory"
     naming variants defensively — inspect actual shapeNames first and
     normalise). Slug = kebab-case name.
   - LGAs: assign parent state spatially (turf `booleanPointInPolygon` of LGA
     centroid (turf `centerOfMass`) in state polygon; fall back to largest
     intersection area if a centroid falls outside every state). Zone =
     state's zone. Code = `shapeID`. Slug = kebab(name), append `-<state-slug>`
     on collision (LGA names repeat across states).
   - Simplify boundaries for `boundary_geojson` with turf `simplify`
     (tolerance ~0.005 for LGAs, ~0.01 for states, highQuality false) — the
     whole national LGA layer must serialize to well under ~1.5 MB.
   - Write `geom` with raw SQL:
     `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)),3))`
     using the ORIGINAL (unsimplified) geometry.
3. **Grid cells** (20): for each LGA centre `gridIdx()` from zones.ts; upsert
   grid_cells (origin 'lga', active true), set `lgas.grid_cell_id`. Multiple
   LGAs may share a cell — that is fine.
4. **Settlements** (30): create `data/settlements/settlements-fixture.csv`
   with 300+ well-known Nigerian towns/cities (name, state name, lat, lon,
   kind). Use real coordinates you are confident of (state capitals, major
   towns); place less-certain towns at plausible offsets inside their LGA.
   Assign `lga_id` spatially via PostGIS point-in-polygon against `geom`.
   Also document in `docs/DATA.md` how an operator drops a real GRID3 CSV
   into `data/grid3/settlements.csv` (same columns) which this step prefers
   when present.
5. **Plans** (40): seed `plans` from CONVENTIONS prices-are-placeholders:
   `free` (org, ₦0: 1 custom area, 100 API calls/day, no downloads),
   `org_basic` (₦50,000/mo: 5 areas, 10k calls/day, downloads, branded reports),
   `org_pro` (₦200,000/mo: 25 areas, 100k calls/day, all features),
   `sms_daily` (personal_addon, ₦1,000/mo). Limits as jsonb `{apiCallsPerDay, customAreas, downloads, brandedReports}`.
6. **Alert rules** (45): four rows from `ALERT_SEED` in constants.ts with
   fixed templates, e.g. heavy_rain: `"Heavy rain of around {value} mm is
   expected in {lga} on {date}. Flooding of roads and farmland is possible.
   This is an automatic advisory, not an official warning."` (write all four
   sensibly; keep the last sentence everywhere).
7. **Demo users** (50): via `auth.api.signUpEmail` (import `auth` from
   `@/lib/auth`): admin@weatherdesk.ng/admin12345 (role admin),
   editor@weatherdesk.ng/editor12345 (role editor), user@weatherdesk.ng/user12345,
   orgowner@acme.ng/owner12345. Set roles by direct drizzle update on `users`
   after signup. Create organisation "Acme Farms" (better-auth org API or
   direct insert into organizations+members with orgowner as owner) plus one
   custom area (mode lga_set of 3 Kaduna LGAs) and an active `org_basic`
   subscription row.
8. **History + normals** (60, mock mode only — check `env.WD_MODE`):
   - observed_daily: last 2 years for every grid cell from
     `syntheticObserved` (source 'nasa_power', preliminary false except the
     last 7 days which come as 'model_estimate'/preliminary true). Batch
     inserts (500–1000 rows per statement); ~565k rows total; log progress.
   - normals_monthly: aggregate `syntheticObserved` over 1991–2020 per cell
     per month (rain sum→monthly mean, rainy days via `isRainyDay`, mean
     tmax/tmin). This is ~8.5M cheap calls — fine; show progress every 50 cells.
   - normals_season: per cell, run `detectOnset`/`detectCessation` (calc.ts)
     per synthetic year 1991–2020 (onset search from Feb 1 south / Apr 1 if
     lat ≥ 9; cessation search from Sep 1), take median onset/cessation DOY,
     length = difference. Null when fewer than 10 years detect an onset.
9. **Geo library** `src/lib/geo/`:
   - `lookup.ts`: `pointToLga(lat,lon)` (PostGIS ST_Contains on lgas.geom),
     `ensureGridCell(lat,lon)` (upsert, returns cell; marks lastViewedAt),
     `lgaBySlug`, `stateBySlug`, `settlementById` (join LGA/state).
   - `search.ts`: `searchPlaces(q, limit)` — union of states (ILIKE),
     LGAs (ILIKE + similarity), settlements (pg_trgm `%` operator / similarity
     ranked), returns typed PlaceRef-like rows with lat/lon and a `kind`.
   - `simplified.ts`: `getNationalLgaCollection()` /
     `getStatesCollection()` — FeatureCollections from boundary_geojson with
     `{id, slug, name}` properties, module-level cached.
   - `src/server/queries/geo.ts`: thin server-only wrappers used by pages.
10. **Tests**: unit tests for slugging, zone mapping completeness (all 36+FCT
    mapped), simplification size budget, median-DOY helper; integration test
    (WRITE ONLY, do not run) that seeds geography into the test DB and checks
    774 LGAs, every LGA has a state, grid cell and valid geom.

## Rules

- Follow CONVENTIONS.md. tsx scripts run with dotenv; never hardcode DB creds.
- No new dependencies. No `pnpm install`. Never run vitest integration/e2e;
  gates you run: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (and you may
  run `tsx scripts/seed.ts` against the DEV db at localhost:5440 — it is yours
  during this wave).
- Seed must complete in under ~10 minutes on this low-RAM Windows box.
- Report back: what you built, exact commands run + tail of output, row
  counts (states/lgas/cells/settlements/observed/normals), any deviations.
