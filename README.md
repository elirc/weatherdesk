# WeatherDesk

Weather information and reports for all of Nigeria. Current conditions, 16-day forecasts, climate history since 1991, automatic weekly and monthly weather reports, and threshold-based advisories — for every state, every LGA, and any point on the map, including places with no weather station.

WeatherDesk is an independent information service. **It is not affiliated with the Nigerian Meteorological Agency (NiMet).**

## Assumptions

• This is an independent information service. It is not affiliated with the Nigerian Meteorological Agency (NiMet) and every page says so.
• Whether a private service needs registration or a licence to publish forecasts in Nigeria has not been checked. It must be confirmed before public launch.
• All data comes from global weather models and satellite-based records, not local stations. Accuracy is lower than a station-calibrated forecast, especially for thunderstorms. The app shows a confidence label and a public accuracy page.
• Forecasts come from Open-Meteo. Its free tier is for non-commercial use only, so a public launch needs the paid Standard plan (1 million calls a month).
• History and climate normals come from NASA POWER, which is free and needs no key. Normals use the years 1991 to 2020.
• NASA POWER data arrives 2 to 7 days late. The most recent days use model estimates from the forecast provider, labelled preliminary, and are replaced when NASA POWER data arrives.
• Google's Weather API is an optional second provider behind the same interface. It covers Nigeria for current conditions, forecasts and recent hourly history, but offers no weather alerts there. IBM's weather service (now The Weather Company) is not used in version one, but can be added later as another provider.
• Coverage is prepared in advance for all 774 local government areas (LGAs) and fetched on demand for any other point, cached on a grid of about 11 km.
• Place search uses the GRID3 list of named settlements plus states and LGAs.
• Report text is written from fixed templates filled with computed numbers. No AI-written text is used in version one, so numbers cannot be misstated.
• Weekly reports publish every Monday at 6 am. Monthly reports publish as preliminary on the 2nd and as final on the 10th. An editor can review and correct them.
• Alerts are automatic advisories based on thresholds. They are labelled as not official warnings.
• The public site is free. Organisations pay for custom areas, branded reports, bulk downloads and API access. Daily SMS or WhatsApp forecasts are paid because each message costs money. Prices are placeholders.
• Market: Nigeria only. Naira, Africa/Lagos time. Visitors are mostly on Android phones with slow or patchy data.
• Not in version one: aviation and marine weather, river and flood forecasting, air quality, model-based seasonal forecasts, radar, and native mobile apps.
• Units are degrees Celsius, millimetres and km/h. The language is English.

## Stack

TypeScript (strict) · Next.js 16 App Router · PostgreSQL + PostGIS + pg_trgm · Drizzle ORM · Better Auth · Tailwind CSS 4 + shadcn/ui · MapLibre GL · pg-boss · @react-pdf/renderer + d3-geo · Vitest + Playwright · Docker Compose.

Versions as built and tested:

| Component | Version |
| --- | --- |
| Node.js / pnpm | 22.16 / 9.12.3 |
| Next.js (App Router, Cache Components, Turbopack) / React | 16.4.0 / 19.3.0 |
| TypeScript | 5.9.3 (strict) |
| PostgreSQL / PostGIS / pg_trgm | 18.0 / 3.6.2 / 1.6 |
| Drizzle ORM / drizzle-kit | 0.45.4 / 0.31.11 |
| Better Auth (organization + phone plugins) | 1.7.7 |
| Tailwind CSS / shadcn/ui CLI | 4.3.3 / 4.21.4 |
| pg-boss | 12.37.0 |
| MapLibre GL (via react-map-gl 8) | 6.13.0 |
| Recharts | 3.10.1 |
| @react-pdf/renderer / d3-geo | 4.9.0 / 3.1.1 |
| Zod | 4.6.5 |
| Vitest / Playwright | 5.0.3 / 1.64.0 |

## Quick start (mock mode)

```bash
cp .env.example .env            # defaults are mock mode
docker compose up -d db          # PostGIS database
pnpm install
pnpm db:migrate                  # drizzle migrations
pnpm seed                        # geography + 2 years of fixture history + normals + reports
pnpm dev                         # web on :3000
pnpm worker:dev                  # queue worker (separate terminal)
```

Or everything in containers: `docker compose up` then `docker compose exec web pnpm seed`.

Demo accounts created by the seed (mock/dev only — with `AUTH_MOCK=true` the sign-in page also shows a one-click "Quick sign-in" card for them):

| Role | Email | Password |
| --- | --- | --- |
| Platform admin | admin@weatherdesk.ng | admin12345 |
| Editor (report queue) | editor@weatherdesk.ng | editor12345 |
| Public user | user@weatherdesk.ng | user12345 |
| Org owner, Acme Farms (Organisation Basic, custom area "Southern Kaduna farms") | orgowner@acme.ng | owner12345 |

In mock mode every provider adapter returns deterministic fixtures and no external call is made. The app **refuses to start in production with mock auth enabled** — this includes `pnpm build` (which runs with `NODE_ENV=production`): if your dev `.env` sets `AUTH_MOCK=true` for the quick sign-in card and e2e, build with `AUTH_MOCK=false pnpm build`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js web app (`next dev` / `next build` / `next start`) |
| `pnpm worker:dev` / `pnpm worker` | pg-boss worker (jobs, schedules) via tsx; `:dev` restarts on file changes |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit migrations |
| `pnpm seed` | full seed (`tsx scripts/seed.ts`): geography, grid cells, settlements, plans + demo users, fixture history, normals, accuracy, alerts, reports + PDFs. Idempotent; `--only=10,20` / `--skip=60` select steps |
| `pnpm test` | all Vitest projects (unit + integration) |
| `pnpm test:unit` | DB-free Vitest unit tests (`tests/unit/**`) |
| `pnpm test:integration` | DB Vitest tests against `TEST_DATABASE_URL` (`tests/integration/**`), run serially |
| `pnpm test:e2e` | Playwright end-to-end suite (`tests/e2e/**`) — see Testing |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint (gates) |

## Testing

- **Unit** (`pnpm test:unit`): weather calculations (percent-of-normal, start of rains, dry spells), every alert rule at its threshold, accuracy metrics, narrative templates, API rate limits and keys, adapters, worker jobs, geo helpers, report policy.
- **Integration** (`pnpm test:integration`): geography seed and the job pipeline against the separate test database.
- **End-to-end** (`pnpm test:e2e`): runs against the **seeded dev database** in mock mode. Playwright starts `pnpm dev` itself on port **3100** (override with `E2E_PORT` / `E2E_BASE_URL`) and pins `APP_URL`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to that origin (Better Auth rejects sign-ins from any other origin). First run: `pnpm exec playwright install chromium`. One worker, serial. Specs create timestamp-suffixed users/orgs and delete them (and their keys, areas, reports, subscriptions) afterwards.

| Spec | Covers |
| --- | --- |
| `01-remote-lga` | search a remote LGA (Gwadabawa) → place page: 16-day list, confidence badges, provenance/age line → Climate tab (normals chart, rainy-season card) → History tab (table rows, CSV link) |
| `02-weekly-report` | /reports → latest weekly national report: headline, state table, every map image served and painted, PDF download (application/pdf, > 20 KB) |
| `03-signup-save-place` | UI sign-up → save a place from search on /dashboard → weather chip → alerts toggle off/on (checked in DB and after reload) |
| `04-org-branded-report` | create organisation → upgrade through mock Paystack checkout → LGA-set custom area (2 LGAs) → branded report generated by the report engine → reports row carries the org id → org PDF route serves it to members, 404 publicly and anonymously |
| `05-api-key` | create API key (plaintext shown once) → `GET /api/v1/forecast?lga=…` with Bearer key (200, data, `meta.attribution`) → bad key 401 → burst past the per-minute limit → 429 + `Retry-After` |
| `06-provider-resilience` | fresh page shows provenance + age; backdating one cell's `fetched_at` by 13 h shows "Forecast update delayed — showing last good data" while the forecast still renders (restored afterwards) |
| `07-mobile` (Pixel 7 project, `@mobile`) | home map + layer switch, place page readable without horizontal scroll, farming-tab plain-language blocks |
| `nimet-disclaimer` | NiMet disclaimer in header and footer of /, /alerts, /accuracy, /reports, /about and a place page |

The branded-report spec calls the report engine directly (`tests/e2e/helpers/branded-report-cli.ts`, the same `generateReportCore` + `renderReportPdfCore` calls the seed uses) instead of queueing a job, so it does not depend on a worker process being up. Under Cache Components, `notFound()` pages return HTTP 200 with the not-found UI (see Deviations), so e2e asserts on visible content for those.

## Data sources & attribution

- **Open-Meteo** — forecasts (CC BY 4.0, non-commercial free tier; paid plan required for public launch).
- **NASA POWER** — daily history and 1991–2020 climate normals (free, no key).
- **geoBoundaries (gbOpen)** — state and LGA boundaries, CC BY 4.0 (www.geoboundaries.org). *Deviation from the brief: the brief names GRID3 for boundaries; GRID3 downloads need a portal account, so the committed boundaries come from geoBoundaries. The seed script also ingests GRID3 files when placed in `data/grid3/` — see `docs/DATA.md`.*
- **GRID3** — named settlements (operator-supplied file; a fixture subset is committed for development).
- **OpenStreetMap / OpenFreeMap** — base map tiles.

Attribution for all of the above is shown in the site footer and in every report.

## Architecture

- `src/app` — Next.js App Router: public pages (server components, prerendered shells with cached data via Cache Components / `"use cache"` + `cacheLife`), dashboard, org, staff tools, API route handlers.
- `src/worker` — pg-boss worker process: forecast fetch (6-hourly), daily pipeline, NASA POWER backfill, alert evaluation, accuracy stats, report generation.
- `src/adapters` — one interface per provider, each with a `mock` and a `real` driver chosen by env: forecast (Open-Meteo, optional Google Weather), history (NASA POWER), SMS/WhatsApp (Termii), email (Resend), payments (Paystack), file storage (local disk or S3).
- `src/db` — Drizzle schema (PostGIS geometry columns), migrations in `drizzle/`.
- `src/reports` — report computation, fixed narrative templates, server-side SVG maps (d3-geo), PDFs (@react-pdf/renderer).
- `src/lib` — env (Zod-validated), time (UTC storage, Africa/Lagos display), money (integer kobo), geo, weather calculations, queue contracts, authz.

Engineering rules live in `docs/CONVENTIONS.md`. Build plan and agent ownership in `docs/BUILD-PLAN.md`.

## Deviations from the brief

Honest list of where the build differs from the product brief or the engineering conventions, and why.

- **Boundaries from geoBoundaries, not GRID3.** GRID3 boundary downloads need a portal account, so the committed state (37) and LGA (774) boundaries are geoBoundaries gbOpen ADM1/ADM2 (CC BY 4.0). The seed ingests GRID3 files instead when they are placed in `data/grid3/` (`docs/DATA.md`).
- **Settlements are a fixture subset.** Search uses a hand-compiled fixture of 387 towns (`data/settlements/settlements-fixture.csv`: state capitals and major towns, smaller towns placed approximately) plus all states and LGAs. The full GRID3 settlement list is operator-supplied before launch (go-live checklist).
- **Cache Components instead of `export const revalidate`.** `docs/CONVENTIONS.md` rule 4 says public pages use `export const revalidate`. The app runs Next 16 with `cacheComponents: true`, where route-segment `revalidate` is not allowed; the same timed freshness is expressed with `"use cache"` + `cacheLife` on the data components (e.g. the forecast view refreshes every 30 minutes) and static shells are prerendered (PPR).
- **Not-found pages return HTTP 200.** With Cache Components and streaming, `notFound()` raised inside a streamed segment renders the not-found UI after the 200 status line has been sent, so unknown places/reports show the correct "not found" page but with status 200. Documented and accepted for v1.
- **`pnpm build` with a mock-mode `.env`.** The env guard refuses `AUTH_MOCK=true` when `NODE_ENV=production`, and `next build` runs as production. If your dev `.env` enables the quick sign-in card, build with `AUTH_MOCK=false pnpm build`.
- **Report regeneration.** The staff "Regenerate" action on an unpublished report re-publishes it (v1 behaviour; the UI warns before doing so).
- **No Docker on the build machine.** Docker Compose files ship for deployment, but development and all tests ran against a native PostgreSQL 18 + PostGIS 3.6 instance; the compose stack itself was not exercised here.

## Go-live checklist

- [ ] **Open-Meteo paid Standard plan** purchased (free tier is non-commercial only; ~93k calls/month at 774 cells × 4 runs/day leaves headroom in the 1M/month plan for on-demand cells).
- [ ] **NiMet / regulatory question answered**: confirm whether a private service needs registration or a licence to publish forecasts in Nigeria. Do not launch publicly before this is confirmed.
- [ ] Real GRID3 settlement list loaded (replace the committed fixture subset).
- [ ] `WD_MODE=real` for all adapters; `AUTH_MOCK` unset (the app refuses to start in production with it).
- [ ] Paystack live keys + webhook URL configured and signature verified end-to-end.
- [ ] Termii sender ID approved; Resend domain verified.
- [ ] S3 bucket for report PDFs; `STORAGE_DRIVER=s3`.
- [ ] Map tile style URL on a production plan (OpenFreeMap default or self-hosted).
- [ ] NASA POWER backfill 1991→present completed and normals computed for all 774 cells.
- [ ] Forecast archive accumulating for at least 2 weeks so the accuracy page has data.
- [ ] Rate limits reviewed; API plans priced (current prices are placeholders).
- [ ] NiMet disclaimer visible on every page and in every report PDF (automatic, verify).

## Licence & disclaimers

Advisories are automatic, threshold-based, and **not official weather warnings**. Forecast data is model-derived; see the public Accuracy page for measured error by lead day, zone and month.
