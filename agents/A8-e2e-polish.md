# A8 — E2E & polish agent

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md` (definition of done),
`playwright.config.ts`, the (public)/dashboard/org/staff route trees,
`agents/A1..A7` reports context given in your launch prompt, `README.md`.

## Mission

The definition-of-done end-to-end suite, a provider-failure resilience test,
a mobile pass over the core flows, and the final README accuracy pass.

## You own (write ONLY here)

- `tests/e2e/**`
- `README.md` (final accuracy pass: stack versions, script table, deviations
  noted honestly — keep the Assumptions section VERBATIM as-is)
- `docs/BUILD-PLAN.md` status column updates
- Small cross-cutting fixes ONLY when a test exposes a real bug, and only
  with a note in your report naming the file and why (keep diffs minimal;
  never refactor working code).

## Environment

- App runs in mock mode against the seeded dev DB (localhost:5440). AUTH_MOCK
  is true in .env → the sign-in page shows a quick sign-in card; e2e may use
  it (it exists exactly for this) or do real credential sign-ins.
- The Playwright webServer config starts `pnpm dev` on :3000 (reuses an
  existing server). The orchestrator runs e2e; you run it too (exception to
  the usual agent rule — you ARE the e2e agent): `pnpm test:e2e`. Keep
  workers=1. A pg-boss worker process may be running; some flows (custom-area
  branded report) depend on queue jobs — prefer calling the engine directly
  via a test helper that hits a route, or assert the queued state rather than
  racing the worker.
- NEVER: pnpm install/add, pnpm build (orchestrator does it), schema changes.

## The definition-of-done story (one spec file per numbered item)

1. **Remote LGA**: search for a remote LGA (e.g. "Gwadabawa" or another
   non-capital LGA), open its place page, assert forecast rows (16 days),
   confidence badges, provenance line; open Climate tab → normals chart +
   season card; History tab → table rows.
2. **Weekly report**: open /reports, open the latest weekly national report,
   assert headline + table + maps render (img responses 200), download the
   PDF (expect application/pdf > 20 KB).
3. **Sign up** (fresh random email), then **save a place** from search and
   see it on /dashboard with a weather chip; toggle alerts off/on.
4. **Create an organisation** with a custom area (LGA-set of ≥2 LGAs), then
   trigger/obtain its branded report: generate via the staff/editor path or
   an engine call helper — assert a reports row with organizationId set and
   its PDF route serving bytes (the org route, not the public one).
5. **API key**: create a key in the org UI (capture the once-shown
   plaintext), then `request.get('/api/v1/forecast?lga=<code>')` with
   Authorization Bearer — expect 200 + data + meta.attribution; burst past
   the per-minute limit and expect 429 with Retry-After.
6. **Provider failure resilience**: with the app running, stop fresh data
   from arriving (no action needed — mock data is static) and assert the
   place page shows the DataAge/provenance line; then simulate a stale
   forecast: UPDATE forecast_daily/hourly fetched_at to >12h ago for one
   cell via a test DB helper, reload its place page, assert the "last good
   data" notice renders and the page still shows the forecast. Restore
   fetched_at afterwards.
7. **Mobile (@mobile project)**: home map visible and layer switch works,
   place page readable, farming tab plain-language blocks visible at Pixel-7
   size.

Also: a small smoke spec asserting the NiMet disclaimer is present in the
header/footer of every top-level public page (/, /alerts, /accuracy,
/reports, /about, a place page).

## Rules

- Tests must be independent and re-runnable: unique emails/org names per run
  (timestamp suffix), clean up rows you create where practical (delete the
  e2e org's api keys/areas via the UI or direct SQL teardown in the spec).
- Use data-testid only when text/role selectors are genuinely ambiguous —
  if you must add one to an app file, that counts as a cross-cutting fix
  (name it in the report).
- Never mark a test as passing that you did not see pass. Report the full
  `pnpm test:e2e` tail. Flaky tests: fix the wait condition, don't add
  retries beyond the config default.
- Gates to report: pnpm typecheck, pnpm lint, pnpm test:unit, pnpm test:e2e
  (full output tail). Leave no dev server running.

Report back: spec list with scenario coverage, gate tails, bugs found +
fixed (file + why), README diffs summary.
