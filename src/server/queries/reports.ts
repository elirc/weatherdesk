import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { reports, states } from "@/db/schema";
import type { ReportContent } from "@/reports/content-types";

/**
 * Public report queries (A4). Visibility rule, enforced IN EVERY QUERY:
 * status != 'draft' AND published_at IS NOT NULL AND organization_id IS NULL.
 * Org-branded copies are never listed or served on public routes.
 */

function publicOnly(): SQL {
  return and(ne(reports.status, "draft"), isNotNull(reports.publishedAt), isNull(reports.organizationId))!;
}

export type ReportListItem = {
  id: string;
  type: "weekly" | "monthly";
  scopeType: "national" | "state" | "custom_area";
  scopeKey: string;
  stateName: string | null;
  stateSlug: string | null;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "preliminary" | "final";
  publishedAt: Date | null;
  hasPdf: boolean;
  headline: string | null;
  periodLabel: string | null;
};

export type ReportFilters = {
  type?: "weekly" | "monthly";
  /** 'national' or a state slug */
  scope?: string;
  year?: number;
};

export async function listPublicReports(f: ReportFilters, limit = 200): Promise<ReportListItem[]> {
  const conds: SQL[] = [publicOnly(), ne(reports.scopeType, "custom_area")];
  if (f.type) conds.push(eq(reports.type, f.type));
  if (f.scope === "national") conds.push(eq(reports.scopeType, "national"));
  else if (f.scope) conds.push(eq(states.slug, f.scope));
  if (f.year) conds.push(sql`extract(year from ${reports.periodStart}) = ${f.year}`);
  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeType: reports.scopeType,
      scopeKey: reports.scopeKey,
      stateName: states.name,
      stateSlug: states.slug,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      publishedAt: reports.publishedAt,
      pdfKey: reports.pdfKey,
      headline: sql<string | null>`${reports.content}->>'headline'`,
      periodLabel: sql<string | null>`${reports.content}->>'periodLabel'`,
    })
    .from(reports)
    .leftJoin(states, eq(states.id, reports.stateId))
    .where(and(...conds))
    .orderBy(desc(reports.periodStart), asc(reports.type), asc(states.name))
    .limit(Math.max(1, Math.min(500, limit)));
  return rows.map(({ pdfKey, ...r }) => ({ ...r, hasPdf: !!pdfKey }));
}

/** Years that have public reports (descending) for the archive filter. */
export async function listPublicReportYears(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ y: sql<number>`extract(year from ${reports.periodStart})::int` })
    .from(reports)
    .where(publicOnly());
  return rows.map((r) => Number(r.y)).sort((a, b) => b - a);
}

/** Map metadata only — the SVG markup itself is served by /reports/[id]/map/[key]. */
export type ReportMapRef = { key: string; title: string; viewBox: string | null };

export type PublicReport = ReportListItem & {
  /** content WITHOUT svgs (stripped in SQL to keep page/cache payloads small) */
  content: Omit<ReportContent, "svgs">;
  maps: ReportMapRef[];
  narrative: string;
  correctionNote: string | null;
  updatedAt: Date;
  pdfKey: string | null;
};

export async function getPublicReport(id: string): Promise<PublicReport | null> {
  if (!id || id.length > 64) return null;
  const [r] = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeType: reports.scopeType,
      scopeKey: reports.scopeKey,
      stateName: states.name,
      stateSlug: states.slug,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      publishedAt: reports.publishedAt,
      pdfKey: reports.pdfKey,
      content: sql<unknown>`${reports.content} - 'svgs'`,
      maps: sql<ReportMapRef[] | null>`(
        select coalesce(jsonb_agg(jsonb_build_object(
          'key', s->>'key',
          'title', s->>'title',
          'viewBox', substring(s->>'svg' from 'viewBox="([0-9. -]+)"')
        ) order by ord), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(${reports.content}->'svgs') = 'array'
          then ${reports.content}->'svgs' else '[]'::jsonb end) with ordinality as t(s, ord)
        where s->>'key' is not null
      )`,
      narrative: reports.narrative,
      correctionNote: reports.correctionNote,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(states, eq(states.id, reports.stateId))
    .where(and(eq(reports.id, id), publicOnly()))
    .limit(1);
  if (!r) return null;
  const content = (r.content ?? {}) as Omit<ReportContent, "svgs">;
  return {
    ...r,
    content,
    maps: r.maps ?? [],
    hasPdf: !!r.pdfKey,
    headline: typeof content?.headline === "string" ? content.headline : null,
    periodLabel: typeof content?.periodLabel === "string" ? content.periodLabel : null,
  };
}

/** Public PDF key for a report id (null when not public or no PDF yet). */
export async function getPublicReportPdfKey(id: string): Promise<{ pdfKey: string; periodStart: string; type: string } | null> {
  if (!id || id.length > 64) return null;
  const [r] = await db
    .select({ pdfKey: reports.pdfKey, periodStart: reports.periodStart, type: reports.type })
    .from(reports)
    .where(and(eq(reports.id, id), publicOnly()))
    .limit(1);
  return r?.pdfKey ? { pdfKey: r.pdfKey, periodStart: r.periodStart, type: r.type } : null;
}

/**
 * One map SVG of a PUBLIC report (same visibility rule), plus the report's
 * updatedAt so callers can version URLs / caches. null when not found.
 */
export async function getPublicReportSvg(
  id: string,
  key: string,
): Promise<{ svg: string; title: string; updatedAt: Date } | null> {
  if (!id || id.length > 64 || !key || key.length > 64) return null;
  const [r] = await db
    .select({
      svg: sql<string | null>`(
        select s->>'svg' from jsonb_array_elements(case when jsonb_typeof(${reports.content}->'svgs') = 'array'
          then ${reports.content}->'svgs' else '[]'::jsonb end) as t(s)
        where s->>'key' = ${key} limit 1)`,
      title: sql<string | null>`(
        select s->>'title' from jsonb_array_elements(case when jsonb_typeof(${reports.content}->'svgs') = 'array'
          then ${reports.content}->'svgs' else '[]'::jsonb end) as t(s)
        where s->>'key' = ${key} limit 1)`,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .where(and(eq(reports.id, id), publicOnly()))
    .limit(1);
  return r?.svg ? { svg: r.svg, title: r.title ?? key, updatedAt: r.updatedAt } : null;
}
