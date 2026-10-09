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

In mock mode every provider adapter returns deterministic fixtures and no external call is made. The app **refuses to start in production with mock auth enabled** — this includes `pnpm build` (which runs with `NODE_ENV=production`): if your dev `.env` sets `AUTH_MOCK=true` for the quick sign-in card and e2e, build with `AUTH_MOCK=false pnpm build`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js web app |
| `pnpm worker:dev` / `pnpm worker` | pg-boss worker (jobs, schedules) |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit migrations |
| `pnpm seed` | full seed: geography, fixtures, normals, reports |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm typecheck` / `pnpm lint` | gates |

## Data sources & attribution

- **Open-Meteo** — forecasts (CC BY 4.0, non-commercial free tier; paid plan required for public launch).
- **NASA POWER** — daily history and 1991–2020 climate normals (free, no key).
- **geoBoundaries (gbOpen)** — state and LGA boundaries, CC BY 4.0 (www.geoboundaries.org). *Deviation from the brief: the brief names GRID3 for boundaries; GRID3 downloads need a portal account, so the committed boundaries come from geoBoundaries. The seed script also ingests GRID3 files when placed in `data/grid3/` — see `docs/DATA.md`.*
- **GRID3** — named settlements (operator-supplied file; a fixture subset is committed for development).
- **OpenStreetMap / OpenFreeMap** — base map tiles.

Attribution for all of the above is shown in the site footer and in every report.

## Architecture

- `src/app` — Next.js App Router: public pages (server-rendered, timed revalidation), dashboard, org, staff tools, API route handlers.
- `src/worker` — pg-boss worker process: forecast fetch (6-hourly), daily pipeline, NASA POWER backfill, alert evaluation, accuracy stats, report generation.
- `src/adapters` — one interface per provider, each with a `mock` and a `real` driver chosen by env: forecast (Open-Meteo, optional Google Weather), history (NASA POWER), SMS/WhatsApp (Termii), email (Resend), payments (Paystack), file storage (local disk or S3).
- `src/db` — Drizzle schema (PostGIS geometry columns), migrations in `drizzle/`.
- `src/reports` — report computation, fixed narrative templates, server-side SVG maps (d3-geo), PDFs (@react-pdf/renderer).
- `src/lib` — env (Zod-validated), time (UTC storage, Africa/Lagos display), money (integer kobo), geo, weather calculations, queue contracts, authz.

Engineering rules live in `docs/CONVENTIONS.md`. Build plan and agent ownership in `docs/BUILD-PLAN.md`.

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
