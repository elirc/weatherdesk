# WeatherDesk build plan

Orchestration: Fable plans, pre-writes shared contracts, reviews and runs all
gates; Opus agents build inside strictly disjoint file ownership. One install
only (done); agents never run installs, integration tests, e2e or builds.

## Foundation (done, orchestrator)

- Next 16.4 + TS strict + Tailwind 4 + shadcn (23 components), pnpm.
- PG18 + PostGIS 3.6 + pg_trgm on localhost:5440 (user-space install,
  `C:\Users\Owner\pg18-postgis`, data `C:\Users\Owner\pgdata-weatherdesk`).
  DBs: weatherdesk_dev, weatherdesk_test. Docker Compose files ship for
  deployment but Docker is not installed on this box.
- Drizzle schema for ALL tables (migration 0000 applied), adapters
  (interfaces + deterministic mocks + real stubs), Better Auth 1.7.7 config,
  authz helpers, queue contracts (pg-boss 12), ops helpers, env (refuses
  AUTH_MOCK in production), time/money/ids/rate-limit, weather calc library,
  geo zones/grid helpers, layout + header/footer with NiMet disclaimer,
  provenance components, vitest (unit/integration projects) and playwright
  configs, boundaries data (geoBoundaries ADM1 37 / ADM2 774) in
  `data/boundaries/raw/`.

## Waves

| Wave | Agent | Mission | Owns (write access) | Status |
| --- | --- | --- | --- | --- |
| 1 | A1 geo-seed | geography seed, grid cells, settlements fixture, seed framework, demo users/plans/alert-rule seeds, mock history+normals seed, geo query lib | `scripts/**`, `src/lib/geo/**`, `src/server/queries/geo.ts`, `data/settlements/**`, `data/derived/**`, `docs/DATA.md`, `tests/unit/geo/**`, `tests/integration/geo.test.ts` | done (f26aa1f) |
| 1 | A2 pipeline | real adapter drivers, worker process, all jobs (forecast/daily/backfill/normals/alerts/accuracy/notifications), budget guard | `src/adapters/real/**`, `src/worker/**`, `tests/unit/{adapters,weather,worker}/**`, `tests/integration/pipeline.test.ts` | done (f26aa1f, attachments 0eb0402) |
| 2 | A3 public-core | home map, search, place pages (now/48h/16d), widget, on-demand points | `src/app/(public)/page.tsx`, `src/app/(public)/place/**`, `src/app/widget/**`, `src/app/api/geo/**`, `src/app/api/widget/**`, `src/components/{map,forecast,search}/**`, `src/server/queries/weather.ts` | done (0eb0402) |
| 2 | A4 public-info | climate/history/farming tabs, month-so-far, alerts page, accuracy page, reports archive+view, about, sitemap, history CSV | `src/app/(public)/{alerts,accuracy,reports,about}/**`, place climate/history/farming subpages, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/api/downloads/**`, `src/server/queries/{climate,alerts,reports,accuracy}.ts`, `src/components/{climate,history}/**` | done (0eb0402) |
| 2 | A5 reports | report computation, narrative templates, SVG maps (d3-geo), PDFs, publish flow, report seed step | `src/reports/**`, `scripts/seed-steps/70-reports.ts`, `tests/unit/reports/**` | done (0eb0402) |
| 3 | A6 accounts-api | auth pages, dashboard (saved places/subscriptions), organisations (custom areas, branded config, team), public API v1 + OpenAPI + keys + limits, Paystack billing, downloads | `src/app/(auth)/**`, `src/app/dashboard/**`, `src/app/org/**`, `src/app/billing/**`, `src/app/api/v1/**`, `src/app/api/webhooks/**`, `src/lib/api/**`, `src/server/queries/{account,org,billing}.ts`, `public/openapi.json`, `src/app/api-docs/**` | done (2a227a2) |
| 3 | A7 staff | editor report queue (preview/edit/publish/correct), alert rules, notices, platform admin (health, jobs, usage, users, orgs, plans, audit) | `src/app/staff/**`, `src/server/queries/staff.ts` | done (2a227a2) |
| 4 | A8 e2e-polish | Playwright e2e story, mobile pass, README final, fixes under direction | `tests/e2e/**`, cross-cutting fixes as directed |

Frozen shared files (change only via orchestrator): everything under `src/db/`,
`src/adapters/types.ts`, `src/adapters/index.ts`, `src/adapters/mock/**`,
`src/lib/{env,time,money,ids,rate-limit,queue,auth,auth-client,authz,ops}.ts`,
`src/lib/weather/{types,constants,calc}.ts`, `src/lib/geo/zones.ts`,
`src/reports/generate.ts` signatures, configs, `src/components/ui/**`.

## Gates between waves (orchestrator)

1. `pnpm typecheck` && `pnpm lint`
2. `pnpm test:unit`
3. `pnpm test:integration` (serial, test DB)
4. seed + boot web+worker in mock mode, click through
5. after wave 4: `pnpm build`, full e2e, definition-of-done checklist from the brief

## Definition of done (from the product brief)

- seed in mock mode → all states/LGAs, ≥2 years fixture history, normals,
  4 published weekly + 1 monthly report.
- Unit tests: percent-of-normal, start-of-rains, each alert rule on its
  threshold, accuracy metrics, narrative templates, API rate limits.
- E2E: search remote LGA → forecast + climate → weekly report + PDF → sign up
  → save place → create org + custom area → branded report → API call with key.
- Provider failure leaves pages working on last good data with age shown.
- typecheck, lint, all tests pass; README complete with Assumptions + go-live checklist.
