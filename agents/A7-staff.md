# A7 — Staff tools agent (editor + platform admin)

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`, `src/lib/authz.ts`
(requireEditor / requireAdmin), `src/db/schema/{reports,alerts,ops,billing,auth,geo}.ts`,
`src/lib/ops.ts` (writeAudit), `src/lib/queue.ts`, `src/reports/generate.ts`,
`src/adapters/index.ts` (storage for PDFs), `src/lib/{time,money}.ts`,
existing dashboard/org pages for style (src/app/dashboard, src/app/org).

## Mission

Staff surfaces. Editor: report queue (preview, edit narrative, publish/
unpublish, correction notes), alert rule thresholds, pinned notices.
Platform admin: data source health, job runs with retry, provider call
budget, users, organisations, plans, API usage, audit log.

## You own (write ONLY here)

- `src/app/staff/**` (layout guards requireEditor; /staff/admin/** guards requireAdmin)
- `src/server/queries/staff.ts`
- `tests/unit/staff/**`

## Deliverables

1. **Staff layout** (`/staff`): side nav (Reports, Alert rules, Notices;
   Admin section visible to admins only: Health, Jobs, Users, Organisations,
   Plans, API usage, Audit). Server-side guard in layout AND every action
   (defence in depth). 404 (notFound()) for non-staff, not a redirect leak.
2. **Report queue** (`/staff/reports`): table (TanStack) of reports —
   filters: type, status, scope, period; columns incl. publishedAt, has-PDF,
   organizationId (branded). Row → detail page:
   - Preview: render content JSON like the public view (import A4's
     components from src/app/(public)/reports if exported cleanly; else a
     compact preview of headline/stats/table/svgs — read-only duplication is
     acceptable, note it).
   - Edit narrative: textarea (server action, requireEditor, writeAudit
     'report.narrative.edit'). Add correction note field (sets
     correctionNote + audit 'report.correct').
   - Publish / unpublish buttons: set/clear publishedAt (+status final when
     publishing a preliminary monthly after review), audit each.
   - Regenerate button: sendJob(JOBS.reportGenerate, …) with the row's params.
   - Re-render PDF button: sendJob(JOBS.reportRenderPdf, { reportId }).
3. **Alert rules** (`/staff/alert-rules`): editable table of the four rules —
   threshold (number), severity, enabled toggle, template textarea with
   placeholder legend ({lga} {value} {threshold} {date}); server action
   validates threshold ranges (rain 10–200 mm, heat 35–50 °C, wind 30–150
   km/h, dry spell 5–30 days), updates updatedBy/At, audits
   'alert_rule.update'. Template preview with sample values.
4. **Notices** (`/staff/notices`): CRUD — title, body, scope (select:
   global/home/alerts/reports or free text place:…), active, expiresAt
   (Lagos date input → UTC). Audit create/update/deactivate.
5. **Admin — Health** (`/staff/admin/health`): source_health table (source,
   last success/error ages via ageLabel, latency, consecutive failures,
   calls this month vs env.PROVIDER_CALL_BUDGET_MONTHLY as a progress bar;
   red badge when consecutiveFailures ≥ 3 or lastSuccessAt > 24h).
6. **Admin — Jobs** (`/staff/admin/jobs`): job_runs table (name filter,
   status filter, started/finished, duration, error expandable), Retry
   button per failed run: maps run.name → sendJob with details payload when
   stored (store enough in job details for this; if a run lacks a replayable
   payload, disable with tooltip). "Run now" buttons for the big five
   (forecastRefresh, dailyPipeline, reportsWeekly, reportsMonthly
   preliminary/final) via sendJob. Audit 'job.retry'/'job.trigger'.
7. **Admin — Users** (`/staff/admin/users`): search by email/name, role
   select (user/editor/admin; cannot demote yourself), audit 'user.role'.
   **Organisations**: list with plan, member count, custom areas count, link
   to subscriptions state. **Plans** (`/staff/admin/plans`): edit price
   (naira input → kobo), limits JSON fields (apiCallsPerDay, customAreas,
   downloads, brandedReports as typed inputs), active toggle; audit.
8. **Admin — API usage** (`/staff/admin/api-usage`): per-org/day chart
   (Recharts, last 30 days) + top keys table; data from api_usage joined
   api_keys/organizations.
9. **Admin — Audit** (`/staff/admin/audit`): filterable (action, entity,
   actor, date range) paginated table, newest first.
10. **Unit tests** (run): threshold validation ranges, self-demotion guard,
    retry-payload mapping (pure helpers).

## Hard rules

- Every action: requireEditor/requireAdmin + writeAudit. Zod everywhere.
  Lagos display via time.ts; money via money.ts.
- Read-only toward other agents' files; import their exports, don't edit.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`; `pnpm dev` to click
  through as editor@weatherdesk.ng / admin@weatherdesk.ng (seeded,
  passwords in agents/A1-geo-seed.md §7). NEVER installs/build/
  integration-run/e2e.

Report back: file list, gates output tails, screens verified in dev, friction.
