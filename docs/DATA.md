# WeatherDesk data: geography, seed and fixtures

This page covers where the geographic data comes from, how `pnpm seed` loads it,
and how an operator swaps in real GRID3 settlements.

## Sources and licences

| Data | File | Source | Licence |
| --- | --- | --- | --- |
| States (ADM1, 37 = 36 + FCT) | `data/boundaries/raw/nga-adm1-simplified.geojson` | geoBoundaries `NGA-ADM1` (2022), sourced from GRID3 | CC BY 4.0 |
| LGAs (ADM2, 774) | `data/boundaries/raw/nga-adm2-simplified.geojson` | geoBoundaries `NGA-ADM2`, sourced from GRID3 | CC BY 4.0 |
| Settlements fixture (387 towns) | `data/settlements/settlements-fixture.csv` | hand-compiled: state capitals and major towns at well-known coordinates; smaller towns placed approximately | project fixture |
| Settlements (optional, real) | `data/grid3/settlements.csv` | GRID3 Nigeria settlement extents/points, operator-supplied | GRID3 terms (CC BY 4.0) |
| Derived simplified layers | `data/derived/{states,lgas}-simplified.geojson` | written by seed step 10 | as above |

Metadata for the boundary files is in `data/boundaries/raw/adm{1,2}-meta.json`.
Attribution (geoBoundaries/GRID3, OpenStreetMap) is shown in the site footer and
in every report.

## `pnpm seed`

`pnpm seed` runs `tsx scripts/seed.ts`. It reads `DATABASE_URL` and `WD_MODE`
from `.env` and runs each `scripts/seed-steps/NN-name.ts` in numeric order.
Every step is idempotent (upsert or skip-if-present), so re-running is safe.

```bash
pnpm seed                    # all steps
pnpm seed -- --only=10,20    # just geography + grid
pnpm seed -- --skip=60       # everything except history/normals
```

| Step | What it writes | Idempotency |
| --- | --- | --- |
| `10-geography` | `states` (37), `lgas` (774): simplified `boundary_geojson` plus the original `geom`; `data/derived/*.geojson` | upsert on `code` (ids stay stable) |
| `20-grid` | `grid_cells` for every LGA centre (origin `lga`, active), `lgas.grid_cell_id` | upsert on (lat_idx, lon_idx) |
| `30-settlements` | `settlements`, with `lga_id` from PostGIS | upsert on (name, source, state). Rows are never deleted (`saved_places` references them) |
| `40-plans` | `plans`: free / org_basic / org_pro / sms_daily | upsert on id |
| `45-alert-rules` | `alert_rules`: heavy_rain, heat, wind, dry_spell | skipped if that type already has a rule, so editor edits survive |
| `50-users` | demo users, "Acme Farms" org + owner, a custom area, an org_basic subscription | skip-if-present |
| `60-history-normals` | **mock mode only**: `observed_daily` (2 years), `normals_monthly`, `normals_season` | skips cells that are already complete |
| `70-reports` | owned by the reports agent; if the file is missing the runner warns and continues | — |

A full mock seed takes about 3–5 minutes on the dev laptop, most of it in
tsx/module start-up and step 60.

### Writing a step

Export a `SeedStep` (see `scripts/lib/seed-types.ts`):

```ts
import type { SeedStep } from "../lib/seed-types";
export const step: SeedStep = {
  name: "reports",
  async run({ db, pool, mode, root, log, warn }) {
    // ... idempotent work ...
    return { reports: 5 }; // logged as row counts
  },
};
```

`export default { name, run }` and `export default async function (ctx)` are
also accepted.

### Geography details (step 10)

- **State names.** The committed ADM1 file calls the FCT
  `"Abuja Federal Capital Territory"`. `normaliseStateName()`
  (`src/lib/geo/state-names.ts`) maps that and other variants (FCT, Abuja,
  Nassarawa, "X State") to the canonical keys of `STATE_ZONES`/`STATE_CODES`.
  The stored state is named `Federal Capital Territory`, with slug
  `federal-capital-territory` and code `NG-FC`.
- **Parent state.** Each LGA's parent state is found spatially (turf). The
  LGA centre is turf `centerOfMass`, or `pointOnFeature` when the centre of
  mass lies outside the shape. The parent is the state polygon containing that
  centre; if no state contains it, the state with the largest intersection
  area. With the committed data, all 774 LGAs resolve by centre (0 fallbacks),
  and the per-state counts match the official ones (Kano 44, Katsina 34,
  Lagos 20, FCT 6, …).
- **Slugs.** Slugs are kebab-case. When an LGA name occurs in more than one
  state (Surulere, Obi, Bassa, Ifelodun, Irepodun), **every** copy gets
  `-<state-slug>`, e.g. `surulere-lagos` and `surulere-oyo`.
- **Geometry.** `geom` holds the **original** geometry, passed through
  `ST_Multi(ST_CollectionExtract(ST_MakeValid(...),3))`. `boundary_geojson`
  holds a turf `simplify` copy (tolerance 0.01° for states, 0.005° for LGAs,
  `highQuality: false`) rounded to 4 decimal places. The national LGA layer is
  about 0.6 MB (the budget is 1.5 MB, checked by a unit test).

### Grid (step 20)

The grid uses 0.1° cells (about 11 km): `latIdx = floor(lat*10)`, and the cell
centre is `idx/10 + 0.05` (`src/lib/geo/zones.ts`). The 774 LGA centres fall
into 744 distinct cells, because some dense urban LGAs share a cell. Cells
created later on demand (`ensureGridCell`) have origin `on_demand`.

### Settlements (step 30) and GRID3

The step reads `data/grid3/settlements.csv` when that file exists, with
`source = 'grid3'`. Otherwise it reads the committed fixture, with
`source = 'fixture'`. Both files use the same columns:

```csv
name,state,lat,lon,kind
Zaria,Kaduna,11.0855,7.7199,city
```

- `state` is any state-name spelling that `normaliseStateName` accepts.
- `kind` is free text (`capital` | `city` | `town` | `village` …) and may be empty.
- Fields can be quoted, `#` lines are ignored, and the file is UTF-8 (a BOM is fine).

**To use real GRID3 data:**

1. Download the GRID3 Nigeria settlement point layer (or the centroids of the
   settlement extents) from data.grid3.org.
2. Export or convert it to the five columns above. Most GRID3 exports have a
   settlement name, a state name and point coordinates; rename the columns to
   `name,state,lat,lon,kind`.
3. Save it as `data/grid3/settlements.csv`. It is not committed, because the
   file is large and has its own licence terms.
4. Run `pnpm seed -- --only=30`.

Each row is placed in the LGA of its **named state** whose `geom` contains the
point. If none contains it (coastal points in water, coordinates just across a
border), the row goes to the nearest LGA in that state, and the step logs any
point more than 2 km outside. With the fixture, 385 of 387 points fall inside
an LGA; Brass (an island) and Edda use the nearest LGA instead. Fixture rows
already in the database are left in place, so tidy them separately if you
switch to GRID3 only.

### Plans (step 40) — prices are placeholders

All prices are stored as integer kobo.

| id | kind | ₦/month | API calls/day | custom areas | downloads | branded reports |
| --- | --- | --- | --- | --- | --- | --- |
| `free` | org | 0 | 100 | 1 | no | no |
| `org_basic` | org | 50,000 | 10,000 | 5 | yes | yes |
| `org_pro` | org | 200,000 | 100,000 | 25 | yes | yes |
| `sms_daily` | personal_addon | 1,000 | — | — | — | — |

The `limits` jsonb holds `{ apiCallsPerDay, customAreas, downloads, brandedReports }`,
plus `teamMembers` on the org plans and `dailySends` on `sms_daily`.

### Alert rules (step 45)

The seed thresholds come from `ALERT_SEED`: rain ≥ 50 mm/day, heat ≥ 40 °C,
gusts ≥ 60 km/h, and a dry spell of ≥ 10 days. Templates use `{lga}`,
`{value}`, `{threshold}` and `{date}`, and each one ends with *"This is an
automatic advisory, not an official warning."*

### Demo accounts (step 50) — development and demo only

| email | password | role |
| --- | --- | --- |
| admin@weatherdesk.ng | admin12345 | admin |
| editor@weatherdesk.ng | editor12345 | editor |
| user@weatherdesk.ng | user12345 | user |
| orgowner@acme.ng | owner12345 | user, owner of **Acme Farms** |

Acme Farms has the custom area "Southern Kaduna farms" (`lga_set` of Chikun,
Kajuru and Kachia, with `geom` set to the union of the three) and an active
`org_basic` subscription. Users are created with Better Auth's
`signUpEmail`. If Better Auth refuses to start because of a drizzle schema
mismatch, the step writes the same rows (a user plus a `credential` account
hashed with Better Auth's own `hashPassword`) and logs a warning.

### History and normals (step 60, mock mode)

- `observed_daily` covers the 730 days ending yesterday (Lagos time) for every
  grid cell, using `syntheticObserved` (`src/adapters/mock/climate.ts`). Days
  are marked `nasa_power` (final), except the last 7, which are
  `model_estimate` with `preliminary = true`, matching NASA POWER's real
  delay. That is 744 cells × 730 days = **543,120 rows**. Each cell is written
  with a single `unnest()` statement; Drizzle's `.values()` was about 15×
  slower for 730-row batches on this machine.
- `normals_monthly` uses 1991–2020 per cell per month: mean monthly rain total,
  mean rainy days (≥ 1 mm, `isRainyDay`), and mean Tmax/Tmin. That is 8,928 rows.
- `normals_season` takes the median onset and cessation day-of-year over the
  30 synthetic years, using `detectOnset`/`detectCessation` from `calc.ts`.
  The onset search starts on 1 Feb, or 1 Apr at latitudes ≥ 9°N. The
  cessation search starts on 1 Sep. Each value is null when it was detected in
  fewer than 10 years. Season length = cessation − onset.
- This is about 8.1M synthetic days. They are computed on a pool of 1–4
  `worker_threads` (`scripts/lib/normals-pool.ts`, about 1 minute) and
  inserted 50 cells at a time.

In real mode step 60 does nothing and logs a warning. The worker's NASA POWER
backfill fills these tables instead.

## Geo library

| Module | Exports |
| --- | --- |
| `src/lib/geo/lookup.ts` | `pointToLga(lat, lon)` (PostGIS `ST_Contains`), `ensureGridCell(lat, lon)` (upsert, sets `last_viewed_at`, `created` flag), `lgaBySlug`, `stateBySlug`, `settlementById` |
| `src/lib/geo/search.ts` | `searchPlaces(q, limit)`: states, LGAs and settlements. Ranked exact 1.0 → prefix 0.9 → substring 0.7 → trigram similarity, ignoring punctuation. "Abuja" and "FCT" find the FCT. |
| `src/lib/geo/simplified.ts` | `getNationalLgaCollection()`, `getStatesCollection()`, `getStateLgaCollection(slug)`: FeatureCollections of `boundary_geojson` with `{id, slug, name, …}` properties, cached per process |
| `src/lib/geo/slug.ts`, `state-names.ts`, `query-text.ts` | pure helpers (unit-tested) |
| `src/server/queries/geo.ts` | `server-only` wrappers for pages: the above plus `listStates`, `listLgasForState`, `listAllLgas`, `listSettlementsForLga` |
