import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { alerts, lgas, reports, states } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Data lookups used only by the public API v1 that no existing query
 * module provides (LGA by code-or-slug, filtered alerts, published
 * reports with PDF URLs). Forecast/history/normals reuse the A3/A4 query
 * modules (src/server/queries/{weather,climate}.ts).
 */

export type ApiLga = {
  id: number;
  code: string;
  slug: string;
  name: string;
  stateId: number;
  stateCode: string;
  stateName: string;
  centreLat: number;
  centreLon: number;
  gridCellId: number | null;
};

export async function findLga(ref: string): Promise<ApiLga | null> {
  const [row] = await db
    .select({
      id: lgas.id,
      code: lgas.code,
      slug: lgas.slug,
      name: lgas.name,
      stateId: states.id,
      stateCode: states.code,
      stateName: states.name,
      centreLat: lgas.centreLat,
      centreLon: lgas.centreLon,
      gridCellId: lgas.gridCellId,
    })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(or(eq(lgas.code, ref), eq(lgas.slug, ref.toLowerCase())))
    .limit(1);
  return row ?? null;
}

export async function findStateByCode(code: string): Promise<{ id: number; code: string; name: string } | null> {
  const [row] = await db
    .select({ id: states.id, code: states.code, name: states.name })
    .from(states)
    .where(eq(states.code, code))
    .limit(1);
  return row ?? null;
}

export type ApiAlert = {
  id: string;
  type: string;
  severity: string;
  validFrom: string;
  validTo: string;
  text: string;
  issuedAt: string;
  lga: { code: string; slug: string; name: string };
  state: { code: string; name: string };
  official: false;
};

/** active=true → not yet expired; active=false → also those ended in the last 30 days. Max 500. */
export async function listApiAlerts(f: { stateId?: number; lgaId?: number; active: boolean }, now = new Date()) {
  const since = f.active ? now : new Date(now.getTime() - 30 * 86_400_000);
  const conds: SQL[] = [gt(alerts.validTo, since)];
  if (f.stateId) conds.push(eq(lgas.stateId, f.stateId));
  if (f.lgaId) conds.push(eq(alerts.lgaId, f.lgaId));
  const rows = await db
    .select({
      id: alerts.id,
      type: alerts.type,
      severity: alerts.severity,
      validFrom: alerts.validFrom,
      validTo: alerts.validTo,
      text: alerts.text,
      createdAt: alerts.createdAt,
      lgaCode: lgas.code,
      lgaSlug: lgas.slug,
      lgaName: lgas.name,
      stateCode: states.code,
      stateName: states.name,
    })
    .from(alerts)
    .innerJoin(lgas, eq(lgas.id, alerts.lgaId))
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(and(...conds))
    .orderBy(desc(alerts.validFrom))
    .limit(500);
  const newest = rows.reduce<Date | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null);
  const data: ApiAlert[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    severity: r.severity,
    validFrom: r.validFrom.toISOString(),
    validTo: r.validTo.toISOString(),
    text: r.text,
    issuedAt: r.createdAt.toISOString(),
    lga: { code: r.lgaCode, slug: r.lgaSlug, name: r.lgaName },
    state: { code: r.stateCode, name: r.stateName },
    official: false,
  }));
  return { data, newest };
}

export type ApiReport = {
  id: string;
  type: "weekly" | "monthly";
  scope: string;
  scopeName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  publishedAt: string | null;
  correctionNote: string | null;
  url: string;
  pdfUrl: string | null;
};

/** Published, public (non-org, non-draft) reports, newest period first. */
export async function listApiReports(f: { type?: "weekly" | "monthly"; stateId?: number; national?: boolean; limit: number }) {
  const conds: SQL[] = [isNull(reports.organizationId), isNotNull(reports.publishedAt), ne(reports.status, "draft")];
  if (f.type) conds.push(eq(reports.type, f.type));
  if (f.national) conds.push(eq(reports.scopeKey, "national"));
  if (f.stateId) conds.push(eq(reports.scopeKey, `state:${f.stateId}`));
  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeKey: reports.scopeKey,
      stateCode: states.code,
      stateName: states.name,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      publishedAt: reports.publishedAt,
      correctionNote: reports.correctionNote,
      pdfKey: reports.pdfKey,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(states, eq(states.id, reports.stateId))
    .where(and(...conds))
    .orderBy(desc(reports.periodStart), desc(reports.publishedAt))
    .limit(f.limit);
  const base = env.APP_URL.replace(/\/$/, "");
  const newest = rows.reduce<Date | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);
  const data: ApiReport[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    scope: r.scopeKey === "national" ? "national" : (r.stateCode ?? r.scopeKey),
    scopeName: r.scopeKey === "national" ? "Nigeria" : (r.stateName ?? r.scopeKey),
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    correctionNote: r.correctionNote,
    url: `${base}/reports/${r.id}`,
    pdfUrl: r.pdfKey ? `${base}/reports/${r.id}/pdf` : null,
  }));
  return { data, newest };
}
