# A5 — Reports engine agent (computation, templates, SVG maps, PDFs)

Read first: `docs/CONVENTIONS.md`, `docs/BUILD-PLAN.md`,
`src/reports/generate.ts` (YOUR entry points — keep signatures EXACTLY),
`src/db/schema/{reports,weather,geo,alerts,ops}.ts`,
`src/lib/weather/{constants,calc,types}.ts`, `src/lib/time.ts`,
`src/lib/geo/*` (A1's simplified collections), `src/adapters/index.ts`
(storage + email), `src/lib/queue.ts`, `src/lib/ids.ts`, `src/lib/ops.ts`.

## Mission

The report engine: compute weekly and monthly report content from the DB,
fill fixed narrative templates (no AI text — numbers cannot be misstated),
draw report maps as server-side SVG with d3-geo, render PDFs with
@react-pdf/renderer, and publish per schedule with editor statuses.

## You own (write ONLY here)

- `src/reports/**` (replace the generate.ts stub bodies; signatures frozen)
- `scripts/seed-steps/70-reports.ts`
- `tests/unit/reports/**`

Concurrent agents: A3 (place pages), A4 (report WEB pages — they render your
content JSON; their brief references your "content JSON contract" section
below, so implement exactly what you document here).

## Content JSON contract (binding for you and A4)

`reports.content` is JSON with this TypeScript shape (also export it as types
from `src/reports/content-types.ts` — A4 imports the TYPES ONLY):

```ts
type ReportContent = {
  version: 1;
  headline: string;                    // one template sentence
  periodLabel: string;                 // "6–12 October 2026" / "September 2026"
  scopeLabel: string;                  // "Nigeria" | state name | custom area name
  svgs: { key: string; title: string; svg: string }[];  // inline-safe SVG strings
  stats: {                             // headline numbers
    rainTotalMm: number | null; rainPctOfNormal: number | null;
    meanTmaxC: number | null; tmaxAnomalyC: number | null;
    rainyDays: number | null;
  };
  extremes: {
    wettest: { name: string; valueMm: number }[];   // top 3 LGAs (or cells)
    driest: { name: string; valueMm: number }[];
    hottest: { name: string; valueC: number }[];
  };
  table: {                             // by state (national) or by LGA (state/area)
    rows: { name: string; slug?: string; rainMm: number | null;
            rainPctOfNormal: number | null; band: string | null;
            meanTmaxC: number | null; tmaxAnomalyC: number | null }[];
    unitNote: string;
  };
  alertsIssued: { type: string; count: number }[];
  outlook?: { text: string; days: { date: string; rainMm: number | null;
              tmaxC: number | null }[] };            // weekly only
  seasonProgress?: { zone: string; status: string }[]; // monthly only
  comingMonth?: { text: string };                      // monthly only
  accuracy?: { text: string; maeTmax: number | null;
               rainHitRatePct: number | null };        // monthly only
  methodsNote: string;
  sources: string[];                   // attribution lines
};
```

## Deliverables

1. **Computation** (`src/reports/compute.ts`): given type/scopeKey/period,
   aggregate observed_daily (weekly: Mon–Sun Lagos; monthly: calendar month)
   joined through grid cells → LGAs → states; percent-of-normal against
   normals_monthly (weekly: pro-rate monthly normal by overlapping days —
   document the formula in a comment; months spanning: split by days).
   National scope aggregates states; state scope lists LGAs; custom-area
   scope (scopeKey `area:<id>`) aggregates the area's LGA set or cells
   intersecting its polygon (ST_Intersects on grid cell centre points is
   fine). Alerts issued in period from alerts table. Weekly outlook: next 7
   days forecast_daily aggregated. Monthly extras: season progress by zone
   (share of cells whose onset has occurred vs normals), coming-month
   normals text, accuracy from accuracy_stats for that month.
2. **Narrative templates** (`src/reports/narrative.ts`): fixed sentence
   templates choosing wording from numbers via `classifyNormalBand`
   ("Rainfall was above normal at 134% of the 1991–2020 average…"), headline,
   outlook, season progress, accuracy sentences. PURE functions
   (data in → string out), fully unit-tested including band boundary values
   (79/80/120/121%), null handling ("data unavailable"), and singular/plural.
3. **SVG maps** (`src/reports/svg-maps.tsx`): d3-geo (geoMercator fitted to
   Nigeria) choropleths from A1's simplified collections — rain total map,
   percent-of-normal map (diverging), tmax anomaly (monthly). Server-side
   string rendering (no DOM): build path strings with d3-geo and return
   `<svg>` markup as strings with inline fills, a legend, title and the
   attribution line. Keep each SVG under ~300 KB (LGA-level national map from
   the simplified layer is fine; drop tiny islands if needed).
4. **PDF** (`src/reports/pdf.tsx`): @react-pdf/renderer document — header
   (WeatherDesk or org branding: org logo key from organizations.logo via
   storage adapter + title override from organizations.metadata JSON
   `{brandTitle}`), period, headline, stats row, the SVGs (react-pdf cannot
   rasterize arbitrary SVG strings reliably — use react-pdf's Svg primitives
   by REBUILDING the maps with the same d3 path data via a shared helper, or
   embed as PNG only if a pure-JS rasterizer is already installed (it is
   NOT — so use the Svg-primitive route), table, alerts, outlook, methods,
   NiMet disclaimer footer on every page. `renderReportPdf(reportId)` renders
   to Buffer, stores via storage adapter at
   `reports/<year>/<id>.pdf`, updates pdf_key.
5. **Generate/publish** (`generate.ts` bodies):
   - `generateReport`: compute → narrative → upsert reports row by unique
     (type, scopeKey, periodStart, organizationId): INSERT as status
     'preliminary' (weekly: publish immediately per spec — status 'final',
     publishedAt now, since weekly has no preliminary phase; monthly phase
     'preliminary' → status preliminary + publishedAt; phase 'final' →
     status final + publishedAt refreshed) BUT never clobber an
     editor-published row silently: if existing row has editor-modified
     narrative (narrative differs from template output recorded in
     content.headline? — simpler: add `content.generatedNarrative` and only
     overwrite `narrative` when it still equals the previous generated text),
     keep the editor's narrative and set correctionNote untouched. Queue
     reportRenderPdf. Branded copies: when organizationId set, same content
     but scopeKey of the org's custom area and branding applied at PDF time.
   - `listReportScopes`: 'national' + `state:<id>` for all 37 + `area:<id>`
     for custom areas of orgs with an active subscription whose plan has
     brandedReports.
   - After national weekly/monthly publish: enqueue notificationSend for
     report_subscriptions matching type+scopeKey (email with link; PDF
     attached only if < 2 MB). Notification payload convention (binding,
     from the worker): `{ subject?, text, html?, to? }`.
6. **Seed step** `scripts/seed-steps/70-reports.ts`: generate + publish the
   last 4 complete weeks' national weekly reports AND last complete month's
   monthly (status final) — call your own generateReport + renderReportPdf
   directly (await, no queue). Must work against the mock-seeded DB.
7. **Unit tests** (run them): narrative templates (as above), weekly normal
   pro-rating math, band colouring thresholds, listReportScopes filtering,
   SVG map produces valid svg string with expected path count for a tiny
   3-feature fixture collection.

## Hard rules

- generate.ts SIGNATURES frozen. All times Lagos via time.ts; attribution +
  NiMet disclaimer in every report (web content AND PDF).
- No new deps; @react-pdf/renderer, d3-geo, d3-scale, @turf/turf, exceljs are installed.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`. You may run
  `pnpm exec tsx scripts/seed-steps/70-reports.ts`-style ad-hoc scripts (or a
  tiny scratch runner inside src/reports for manual verification) against the
  dev DB on :5440 — PDFs land under ./storage; open-check at least one PDF's
  byte size > 20 KB and content.svgs non-empty. NEVER installs/build/
  integration/e2e.

Report back: file list, gates output tails, a sample headline + narrative
paragraph from a real dev-DB run, PDF byte sizes, contract friction.
