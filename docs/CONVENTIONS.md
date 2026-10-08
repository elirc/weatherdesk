# WeatherDesk engineering conventions

Every agent and every PR follows these. They implement the brief's engineering rules.

## Hard rules

1. **Time**: store `timestamptz` (UTC) everywhere. Display through `formatLagos*` helpers in `src/lib/time.ts` only — never `toLocaleString` directly. Africa/Lagos is the display zone.
2. **Money**: integer kobo, `int` columns, helpers in `src/lib/money.ts`. Never floats.
3. **Provenance**: every displayed number carries its source and fetch time. Weather values flow through the `SourcedValue` shape (`src/lib/weather/types.ts`): `{ value, source, fetchedAt, preliminary? }`. Preliminary values show the "preliminary" label via `<SourceBadge />`.
4. **Fast on slow phones**: public pages are server components with `export const revalidate = <seconds>`. No client component unless it needs interactivity. Map data is served from pre-simplified GeoJSON (`src/lib/geo/simplified.ts`), never raw boundaries.
5. **Provider resilience**: all provider calls go through the pg-boss queue with throttle + retry (`src/lib/queue.ts` contracts). A provider outage must never break a page — pages render last good data with its age (`<DataAge />` component). Route handlers and server components never call providers directly.
6. **API keys**: stored as SHA-256 hashes (`src/lib/api/keys.ts`), shown once at creation. Per-plan rate limits enforced server-side, usage logged to `api_usage`.
7. **Authz**: every Server Action and route handler calls a `require*` helper from `src/lib/authz.ts` first. Organisation data is always scoped by `organizationId` in the query itself, not filtered after.
8. **Validation**: all input through Zod schemas. Server Actions parse with `schema.parse` before touching the DB. Rate-limit sign-in, OTP and public endpoints via `src/lib/rate-limit.ts`.
9. **Webhooks**: verify Paystack signature (HMAC SHA-512 of raw body with secret key) before parsing.
10. **Attribution**: Open-Meteo, NASA POWER, geoBoundaries/GRID3, OpenStreetMap in the footer (`src/components/layout/footer.tsx`) and in every report (web + PDF).
11. **Mock mode**: adapters in mock mode return deterministic fixtures and make zero network calls. `src/lib/env.ts` **throws at startup** if `NODE_ENV=production` and `AUTH_MOCK=true`.
12. **External integrations**: before coding against a provider API, check its current docs (WebFetch/WebSearch). Do not guess endpoint or field names. Record the doc URL in a comment at the top of the real driver.
13. **NiMet disclaimer**: every public page layout and every report shows "Independent service — not affiliated with NiMet. Advisories are not official warnings."

## Code layout (ownership boundaries — do not write outside your area)

```
src/app            route tree (public, dashboard, org, staff, api)
src/components     React components, by domain (ui/ is shadcn, do not edit)
src/db             drizzle schema + client (FROZEN after foundation — ask orchestrator)
src/adapters       provider interfaces, mock + real drivers
src/lib            shared helpers (env, time, money, geo, weather, queue, authz, api)
src/worker         pg-boss worker process + job handlers
src/reports        report computation, templates, SVG maps, PDF
scripts            seed + data pipelines (tsx)
data               committed fixtures and boundaries
drizzle            generated migrations (generate via pnpm db:generate only)
tests              vitest unit/integration (tests/unit, tests/integration), e2e (Playwright)
```

## Conventions

- TS strict; no `any` unless interfacing an untyped lib (comment why).
- Server Actions live in `actions.ts` files next to their route segment, named `<verb><Noun>Action`.
- DB access from the web app goes through query modules in `src/server/queries/` (one file per domain); no inline SQL in components.
- Drizzle for everything; raw SQL (`sql` template) only for PostGIS functions.
- IDs: `bigint identity` for high-volume weather rows, `text` (UUID via `newId()` from `src/lib/ids.ts`) elsewhere, Better Auth manages its own tables.
- Weather semantics: a "rainy day" is ≥ 1.0 mm. Rain day for accuracy hit-rate: forecast prob ≥ 50% counts as a "rain" call. Dry spell = consecutive days < 1.0 mm. These constants live in `src/lib/weather/constants.ts` — import, never re-declare.
- Zones: the 6 geopolitical zones (`north-west`, `north-east`, `north-central`, `south-west`, `south-east`, `south-south`) via `src/lib/geo/zones.ts`.
- Errors: user-facing failures return typed `{ ok: false, error }` from actions; unexpected errors are thrown and land in the nearest `error.tsx`.
- Every job handler: wrap in `recordJobRun(name, fn)` (writes `job_runs`), call `touchSourceHealth` on provider success/failure.
- Components: server components by default, `"use client"` leaf-only. Charts (Recharts) and the map (MapLibre) are client islands fed serialized props.
- Tests: pure logic under `tests/unit/**` (no DB). DB-touching tests under `tests/integration/**` using `TEST_DATABASE_URL` — **integration tests are run serially by the orchestrator only**, never by build agents (shared DB + low-RAM box).
- Commit style: `area: summary` (e.g. `worker: forecast fetch job`), body lists notable decisions.

## Gates (run before claiming done)

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint
pnpm test:unit     # DB-free vitest projects
```

Report the exact command you ran and its full tail. Never report a gate you did not run. Agents do NOT run `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, or any `pnpm install/add` — the orchestrator does.
