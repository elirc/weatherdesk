# A2 — Pipeline & worker agent

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`, `src/lib/queue.ts`,
`src/adapters/types.ts`, `src/adapters/index.ts`, `src/adapters/mock/*`,
`src/db/schema/{weather,alerts,ops,geo,reports}.ts`, `src/lib/ops.ts`,
`src/lib/weather/{constants,calc,types}.ts`, `src/lib/time.ts`,
`src/reports/generate.ts` (interface stub), `src/lib/env.ts`.

## Mission

The entire data pipeline: real provider drivers, the pg-boss worker process,
and every scheduled/queued job — forecast refresh, daily pipeline (archive,
preliminary observed, NASA top-up, alerts, accuracy), backfill, normals,
on-demand cells, notification sending, daily SMS tick.

## You own (write ONLY here)

- `src/adapters/real/**` (replace the stubs; keep export names/types exactly)
- `src/worker/**`
- `tests/unit/adapters/**`, `tests/unit/weather/**`, `tests/unit/worker/**`
- `tests/integration/pipeline.test.ts` (WRITE only — never run it)

Everything else is read-only. No package.json changes; no new deps. Real
drivers use plain `fetch` (undici via Node 22) — no SDKs.

## Deliverables

1. **Real drivers** (each with the provider doc URL in a header comment —
   verify current endpoint + field names with WebSearch/WebFetch before coding; do not guess):
   - `open-meteo.ts`: forecast API. Multi-coordinate calls
     (`latitude=6.5,7.1&longitude=3.4,5.0` comma style), 16 days daily +
     first 48–72h hourly, fields matching `ForecastResult`. `maxPointsPerCall`
     per current docs (keep ≤ the documented limit; chunk conservatively).
     Also `fetchRecentDaily` via `past_days`. Attach API key when
     `env.OPEN_METEO_API_KEY` set (customer endpoint).
   - `nasa-power.ts`: POWER daily point API (community AG), params
     PRECTOTCORR, T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN; map
     -999 fill values to null; MJ/m² and km/h conversions as needed.
   - `google-weather.ts`: best-effort per current docs; fine to leave as a
     clearly-marked minimal implementation if docs are thin — it is optional.
   - `termii.ts` (SMS + WhatsApp channel), `resend.ts` (emails + attachments),
     `paystack.ts` (initialize/verify transaction + HMAC-SHA512 webhook
     signature over raw body with secret key), `s3.ts` (@aws-sdk/client-s3 IS
     installed — use it).
   - Wrap every outbound call in `withSourceHealth(source, fn, nCalls)`.
     Before provider calls, check the monthly budget: if
     `source_health.callsThisMonth` for the forecast source ≥
     `env.PROVIDER_CALL_BUDGET_MONTHLY`, skip with a logged warning.
2. **Worker** `src/worker/index.ts`: `import "dotenv/config"` first; start
   pg-boss (`startedBoss()`), `createQueue` for every JOBS name, register
   schedules from `SCHEDULES`, register handlers, graceful shutdown on
   SIGINT/SIGTERM, log job lifecycle. Every handler wrapped in
   `recordJobRun(name, fn)`.
3. **Jobs** (`src/worker/jobs/*.ts`):
   - `forecastRefresh`: all active cells → chunks of `maxPointsPerCall` →
     send `forecastFetchChunk` jobs (singletonKey to avoid pile-up).
   - `forecastFetchChunk`: fetch via `getForecastAdapter()`, upsert
     forecast_hourly (delete cell rows older than now-2h after upsert or use
     onConflictDoUpdate; keep ONLY latest run semantics) and forecast_daily.
     Retry via pg-boss options (retryLimit 3, exponential backoff).
   - `dailyPipeline` (01:30 Lagos): (a) snapshot forecast_daily into
     forecast_archive for `ARCHIVE_LEAD_DAYS` (issueDate = Lagos today);
     (b) `fetchRecentDaily` last 7 days → upsert observed_daily as
     source 'model_estimate', preliminary true — never overwrite a
     non-preliminary row; (c) NASA top-up: for each cell find the last
     non-preliminary date, fetch from there to today-2 via history adapter
     (throttle: small batches + `setTimeout` ~200ms between calls in real
     mode), replace preliminary rows (source 'nasa_power', preliminary false);
     (d) alert evaluation (below); (e) accuracy stats update (below);
     (f) deactivate on_demand cells with lastViewedAt older than 7 days.
   - **Alerts**: evaluate enabled alert_rules against the next 7 days of
     forecast_daily joined to LGAs (via lgas.grid_cell_id): heavy_rain
     rainMm ≥ threshold; heat tmaxC ≥ threshold; wind gustsMaxKmh ≥ threshold.
     dry_spell: `trailingDryDays(observed last 20d) + leading forecast dry
     days ≥ threshold` during the cell's rainy season window (between
     normals_season onset/cessation DOY when present). Create one alert per
     LGA/type/day-window, idempotent (skip when an overlapping alert of the
     same type exists), validFrom/validTo = the affected Lagos day(s), text
     from the rule template ({lga}, {value}, {threshold}, {date}). Queue
     `notificationSend` for users with alertsEnabled saved places in that LGA
     (email channel; one notification row per user+alert).
   - `historyBackfillCell` + `normalsComputeCell`: year-chunked NASA fetch →
     observed_daily upserts; then normals_monthly (1991–2020 only) and
     normals_season via calc.ts (median onset/cessation across years). Also a
     small CLI `src/worker/enqueue-backfill.ts` (tsx-runnable) that enqueues
     backfill for all cells with throttle options.
   - `cellActivate`: `ensureGridCell`-style upsert (write your own here —
     A1's lib may not exist yet; a local helper in the worker is fine), fetch
     its forecast immediately, mark active origin 'on_demand'.
   - `reportsWeekly`/`reportsMonthly`: compute periodStart (previous full
     Mon–Sun week / previous calendar month in Lagos time), call
     `listReportScopes()` and send one `reportGenerate` per scope;
     `reportGenerate` handler calls `generateReport(...)`, `reportRenderPdf`
     handler calls `renderReportPdf(...)` — these THROW until A5 lands; catch
     "not implemented" and log a warning so the worker stays healthy.
   - `notificationSend`: load the notification row, render simple text/html,
     send via email/sms adapter by channel, mark sent/failed.
   - `dailySendTick`: find active daily_send_subscriptions whose
     sendTimeLocal falls in the current 15-min Lagos window, build a one-day
     forecast text for the saved place, queue notificationSend (respect
     channel sms/whatsapp).
4. **Accuracy stats**: for yesterday (and any target dates newly covered by
   final observed data), join forecast_archive to observed_daily per cell,
   aggregate by zone (via lga→state zone of the cell's LGAs; cells without an
   LGA use 'national' only) and leadDays: `meanAbsError` for tmax/tmin,
   `rainHitRate` with `RAIN_CALL_PROB_PCT`; upsert accuracy_stats for the
   month bucket (recompute the month's running aggregate from scratch per
   affected month/zone/lead — simplest correct approach).
5. **Provider resilience**: a failing provider must mark source_health and
   leave stale data untouched (pages will show age). Jobs must never crash
   the worker loop.
6. **Unit tests** (run them): adapter response mapping against SMALL inline
   JSON fixtures copied from provider docs (open-meteo, nasa-power mapping,
   -999 → null), alert rule triggers exactly at thresholds (50mm, 40°C,
   60km/h boundary cases), dry-spell composition, accuracy aggregation,
   archive lead-day snapshot logic, budget guard. Test pure functions —
   structure job code as pure core + thin DB shell where practical.

## Rules

- CONVENTIONS.md applies (UTC storage, Lagos civil dates via time.ts;
  provenance columns source/fetchedAt on every weather row).
- Gates you run: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`. NEVER run
  test:integration / test:e2e / build / installs. You may run
  `pnpm worker:dev` briefly against dev DB (localhost:5440) to smoke-test
  startup, but A1 is seeding that DB concurrently — don't be surprised by
  partial geography; keep smoke runs short.
- Mock mode must stay zero-network. Real drivers: verify current docs first.
- Report back: what you built, exact commands + output tails, unit test
  counts, any interface friction with the frozen contracts (do NOT change
  them — report instead).
