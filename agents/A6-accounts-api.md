# A6 — Accounts, organisations, public API & billing agent

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`, `src/lib/auth.ts`,
`src/lib/auth-client.ts`, `src/lib/authz.ts`, `src/db/schema/{auth,billing,reports,geo}.ts`,
`src/lib/{rate-limit,ids,money,env}.ts`, `src/adapters/index.ts` (payments,
storage, email), `src/server/queries/geo.ts`, `src/lib/geo/search.ts`,
`src/lib/queue.ts`, existing public pages for style (src/app/(public)).

## Mission

Everything account-shaped: sign-in/up (email+password, phone OTP), the user
dashboard (saved places, subscriptions, personal SMS add-on), organisations
(team, custom areas, branded report config, downloads), the public API v1
with keys/plans/rate limits + OpenAPI docs page, and Paystack billing.

## You own (write ONLY here)

- `src/app/(auth)/**` (sign-in, sign-up, verify-phone; its own centered layout)
- `src/app/dashboard/**`, `src/app/org/**`, `src/app/billing/**`
- `src/app/api/v1/**`, `src/app/api/webhooks/paystack/route.ts`
- `src/app/api-docs/**`, `public/openapi.json`
- `src/lib/api/**`
- `src/server/queries/{account,org,billing}.ts`
- `tests/unit/api/**`, `tests/integration/accounts.test.ts` (WRITE only)

## Deliverables

1. **Auth pages** (`(auth)` group): sign-in (email+password; link to OTP
   flow), sign-up (name/email/password), phone flow (enter number E.164 NG →
   authClient.phoneNumber.sendOtp → code entry → verify; in mock mode the
   code is logged by the server — show a hint "dev: check server logs").
   react-hook-form + Zod + shadcn Form. Server rate limits already cover OTP;
   add rateLimit on a sign-in server action if you proxy it, else rely on
   client → better-auth route. `?next=` redirect support. AUTH_MOCK=true
   (dev/e2e): render a "Quick sign-in as …" card listing the four seeded
   users; clicking calls a server action that signs in via
   auth.api.signInEmail with the known seed passwords. The card renders ONLY
   when env.AUTH_MOCK && env.NODE_ENV !== 'production'.
2. **Dashboard** (`/dashboard`, requireUser):
   - Saved places: list with current temp/rain chip (join forecast_daily),
     add via search box (reuse A3's combobox if exported from
     src/components/search — read-only import; else a simple form), each
     place: alertsEnabled toggle, delete. Save actions compute gridCellId via
     `ensureGridCell` and fire JOBS.cellActivate for points.
   - Report subscriptions: subscribe to weekly/monthly for national or any
     state (scopeKey select), listed with unsubscribe.
   - Personal add-on: SMS/WhatsApp daily forecast — pick saved place, channel,
     send time (hour select, Lagos), phone (prefill verified number) → needs
     active `sms_daily` subscription: show subscribe button → Paystack
     checkout flow (below). Manage/cancel.
   - Notifications tab: last 50 from notifications table.
3. **Organisations** (`/org`):
   - Create org (better-auth organization plugin via authClient), slug auto.
   - Org home (requireOrgMember): members list, invite by email
     (better-auth invitation; in mock email mode the invite link is logged —
     surface it in the UI for dev), roles.
   - Custom areas (plan-limited count): create via (a) LGA set — searchable
     multi-select of LGAs grouped by state; (b) polygon — textarea accepting
     GeoJSON Polygon/MultiPolygon + "preview" (lightweight static SVG outline
     using d3-geo, server-rendered) + validation (valid ring, within Nigeria
     bbox). Store lgaIds / polygonGeojson + geom via raw SQL ST_GeomFromGeoJSON.
   - Branded reports: upload logo (PNG/JPEG ≤ 500 KB → storage adapter key
     into organizations.logo), brand title (organizations.metadata JSON
     {brandTitle}); list the org's branded reports (reports where
     organizationId = org) with PDF links. Downloads: CSV + Excel (exceljs)
     of observed_daily / forecast_daily for the org's areas, gated by plan
     limits (plans.limits.downloads).
   - Billing page: current plan, Paystack checkout to upgrade
     (initializeTransaction with plan amount, callbackUrl /billing/callback),
     callback verifies via verifyTransaction and upserts subscriptions row;
     webhook `/api/webhooks/paystack` verifies signature over RAW body
     (read req.text() BEFORE parsing), handles charge.success /
     subscription.disable → update subscriptions.status. In mock mode the
     mock-checkout page (src/app/billing/mock-checkout) simulates success →
     redirects to callback.
4. **Public API v1** (`src/app/api/v1/…/route.ts`): endpoints
   - `GET /api/v1/forecast?lat=&lon=` or `?lga=<code>` → 16-day daily (+
     `hourly=true` for 48h) with source+fetchedAt.
   - `GET /api/v1/history?lga=&from=&to=` (max 1 year/request)
   - `GET /api/v1/normals?lga=` (monthly + season)
   - `GET /api/v1/alerts?state=<code>|lga=<code>|active=true`
   - `GET /api/v1/reports?type=&scope=&limit=` (published only, with pdf URLs)
   - Auth: `Authorization: Bearer wd_live_…` → `src/lib/api/keys.ts`:
     sha256 the token, look up api_keys (not revoked), load org plan limits.
     Per-day limit from plans.limits.apiCallsPerDay enforced via api_usage
     upsert-increment (atomic SQL `insert … on conflict do update set count =
     api_usage.count + 1 returning count`; reject over limit with 429 +
     Retry-After). Also per-minute in-memory rateLimit as burst guard.
     Update api_keys.lastUsedAt (throttled: only when > 1 min stale).
     Unauthenticated: allow with RATE_LIMITS.publicApiAnon per IP, add
     `X-WeatherDesk-Notice: unauthenticated preview — get a key` header.
   - Responses: consistent envelope { data, meta: { source, fetchedAt,
     attribution } }; Zod-validate params; errors { error: { code, message } }.
   - API keys UI in /org: create (show plaintext ONCE), name, revoke, usage
     sparkline from api_usage (last 30 days).
5. **OpenAPI** `public/openapi.json` (3.1, hand-written, accurate to your
   routes) + `/api-docs` page rendering it nicely server-side (endpoint list,
   params tables, curl examples with placeholder key) — no external
   doc-UI deps.
6. **Plan enforcement** `src/lib/api/limits.ts`: helpers getOrgPlan(orgId)
   (active subscription → plan, else free), assertWithinLimit(kind, …) used
   by custom-area create, downloads, API. Unit-test the limit math + key
   hashing + the 429 path (pure parts).
7. **Unit tests** (run): key hash/verify roundtrip, plan limit resolution,
   usage-increment SQL builder (if pure), OpenAPI json validity (parse +
   every documented path exists in src/app/api/v1 — a file-system check test).

## Pipeline agent notes that bind you

- Paystack `verifyTransaction()` NEVER returns a subscriptionCode (Paystack
  sends it via the `subscription.create` webhook) — capture it in the webhook
  handler, not the callback.
- Notification payload convention (notifications.payload) is
  `{ subject?, text, html?, to? }` — the worker's `notification.send` handler
  delivers exactly this shape.
- Termii's base URL is `env.TERMII_BASE_URL` (already in env.ts).

## Hard rules

- EVERY server action/route: authz first (requireUser/requireOrgMember/key
  auth), Zod everywhere, org data scoped by organizationId in the query.
- Prices in integer kobo via money.ts; prices are placeholders.
- Webhook signature verification is mandatory before parsing (CONVENTIONS 9).
- Keys: plaintext shown exactly once; store sha256 hex; prefix column for display.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`; `pnpm dev` to click
  through flows in mock mode (AUTH_MOCK=true is set in dev .env — if not, add
  nothing; just note it). NEVER installs/build/integration-run/e2e.

Report back: file list, gates output tails, flows verified in dev (signup,
save place, org+area, key create + authenticated curl), contract friction.
