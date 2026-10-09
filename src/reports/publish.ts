import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { customAreas, notifications, organizations, plans, reports, reportSubscriptions, states, subscriptions } from "@/db/schema";
import { getStorageAdapter } from "@/adapters";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { JOBS, sendJob } from "@/lib/queue";
import type { ReportContent } from "./content-types";
import { computeReport, DISCLAIMER } from "./compute";
import type { GenerateReportInput } from "./generate";
import { buildNarrative } from "./narrative";
import { renderPdfBuffer, type PdfBranding } from "./pdf";
import { decideNarrative, decideStatus, PDF_ATTACH_MAX_BYTES, pdfKeyFor, selectReportScopes, type ReportStatus } from "./policy";

/**
 * Report publishing pipeline. generate.ts (frozen signatures) wraps these
 * with queueing; the seed step calls them directly with queue/notify off.
 */

export type GenerateResult = { id: string; created: boolean; keptEditorText: boolean; status: ReportStatus };

export async function generateReportCore(
  input: GenerateReportInput,
  opts: { now?: Date } = {},
): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const computed = await computeReport({ type: input.type, scopeKey: input.scopeKey, periodStart: input.periodStart });
  const { scope, content } = computed;

  // Custom-area reports always belong to the area's organisation (private,
  // branded). For national/state scopes an organizationId produces a
  // branded copy of the public report.
  if (scope.areaOrganizationId && input.organizationId && input.organizationId !== scope.areaOrganizationId) {
    throw new Error(`custom area ${scope.customAreaId} does not belong to organisation ${input.organizationId}`);
  }
  const organizationId = scope.areaOrganizationId ?? input.organizationId ?? null;

  const generated = buildNarrative(content);
  content.generatedNarrative = generated;

  const where = and(
    eq(reports.type, input.type),
    eq(reports.scopeKey, input.scopeKey),
    eq(reports.periodStart, computed.periodStart),
    organizationId ? eq(reports.organizationId, organizationId) : isNull(reports.organizationId),
  );
  const [existing] = await db
    .select({ id: reports.id, status: reports.status, publishedAt: reports.publishedAt, narrative: reports.narrative, content: reports.content })
    .from(reports)
    .where(where)
    .limit(1);

  const { status, publishedAt } = decideStatus(input.type, input.phase, existing ?? null, now);
  const { narrative, keptEditorText } = decideNarrative(
    existing
      ? { narrative: existing.narrative, generatedNarrative: (existing.content as Partial<ReportContent> | null)?.generatedNarrative }
      : null,
    generated,
  );

  const values = {
    type: input.type,
    scopeType: scope.scopeType,
    scopeKey: input.scopeKey,
    stateId: scope.stateId,
    customAreaId: scope.customAreaId,
    organizationId,
    periodStart: computed.periodStart,
    periodEnd: computed.periodEnd,
    status,
    content,
    narrative,
    publishedAt,
    updatedAt: now,
  };

  if (existing) {
    // correctionNote and pdfKey are left untouched (PDF re-render is queued).
    await db.update(reports).set(values).where(eq(reports.id, existing.id));
    return { id: existing.id, created: false, keptEditorText, status };
  }
  const id = newId();
  await db.insert(reports).values({ id, ...values, createdAt: now });
  return { id, created: true, keptEditorText, status };
}

async function loadBranding(organizationId: string | null): Promise<PdfBranding> {
  const base: PdfBranding = { title: "WeatherDesk", logo: null, organizationName: null };
  if (!organizationId) return base;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return base;
  let title = org.name;
  if (org.metadata) {
    try {
      const meta = JSON.parse(org.metadata) as { brandTitle?: unknown };
      if (typeof meta.brandTitle === "string" && meta.brandTitle.trim()) title = meta.brandTitle.trim();
    } catch {
      /* malformed metadata: fall back to org name */
    }
  }
  let logo: PdfBranding["logo"] = null;
  if (org.logo && !/^https?:/i.test(org.logo)) {
    const file = await getStorageAdapter().get(org.logo).catch(() => null);
    if (file) {
      const ct = file.contentType.toLowerCase();
      if (ct.includes("png")) logo = { data: file.content, format: "png" };
      else if (ct.includes("jpeg") || ct.includes("jpg")) logo = { data: file.content, format: "jpg" };
    }
  }
  return { title, logo, organizationName: org.name };
}

export async function renderReportPdfCore(
  reportId: string,
  opts: { notify: boolean },
): Promise<{ key: string; bytes: number; notified: number }> {
  const [r] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!r) throw new Error(`report ${reportId} not found`);
  const branding = await loadBranding(r.organizationId);
  const buf = await renderPdfBuffer({
    type: r.type,
    status: r.status,
    content: r.content as ReportContent,
    narrative: r.narrative,
    publishedAt: r.publishedAt,
    correctionNote: r.correctionNote,
    branding,
  });
  const key = pdfKeyFor(r.periodStart, r.id);
  await getStorageAdapter().put(key, buf, "application/pdf");
  await db.update(reports).set({ pdfKey: key, updatedAt: new Date() }).where(eq(reports.id, r.id));
  const notified = opts.notify ? await notifySubscribers(r, key, buf.length) : 0;
  return { key, bytes: buf.length, notified };
}

/**
 * After a NATIONAL public report is published and its PDF exists: one email
 * notification per matching report_subscription, once per report (re-renders
 * and the monthly preliminary→final step do not re-notify). Payload follows
 * the worker convention { subject?, text, html?, to? }; extra keys
 * (reportId, url, pdfUrl, attachment) are informational — `attachment` is set
 * only when the PDF is under 2 MB.
 */
async function notifySubscribers(
  r: typeof reports.$inferSelect,
  pdfKey: string,
  pdfBytes: number,
): Promise<number> {
  if (r.scopeKey !== "national" || r.organizationId || !r.publishedAt || r.status === "draft") return 0;
  const [already] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.kind, "report"), sql`${notifications.payload}->>'reportId' = ${r.id}`))
    .limit(1);
  if (already) return 0;
  const subs = await db
    .select({ userId: reportSubscriptions.userId, channel: reportSubscriptions.channel })
    .from(reportSubscriptions)
    .where(and(eq(reportSubscriptions.reportType, r.type), eq(reportSubscriptions.scopeKey, r.scopeKey)));
  if (!subs.length) return 0;
  const content = r.content as ReportContent;
  const url = `${env.APP_URL}/reports/${r.id}`;
  const pdfUrl = `${url}/pdf`;
  const kind = r.type === "weekly" ? "Weekly weather report" : "Monthly climate report";
  const subject = `WeatherDesk ${kind}: ${content.scopeLabel}, ${content.periodLabel}${r.status === "preliminary" ? " (preliminary)" : ""}`;
  const text = `${content.headline}\n\nRead the full report: ${url}\nDownload the PDF: ${pdfUrl}\n\n${DISCLAIMER}`;
  const attachment =
    pdfBytes < PDF_ATTACH_MAX_BYTES
      ? { key: pdfKey, filename: `weatherdesk-${r.type}-${r.periodStart}.pdf`, contentType: "application/pdf" }
      : undefined;
  let n = 0;
  for (const s of subs) {
    const id = newId();
    await db.insert(notifications).values({
      id,
      userId: s.userId,
      kind: "report",
      channel: s.channel === "email" ? "email" : s.channel,
      payload: { subject, text, reportId: r.id, url, pdfUrl, ...(attachment ? { attachment } : {}) },
    });
    await sendJob(JOBS.notificationSend, { notificationId: id }, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
    n += 1;
  }
  return n;
}

export async function listReportScopesCore(): Promise<string[]> {
  const [stateRows, areaRows, subRows, planRows] = await Promise.all([
    db.select({ id: states.id }).from(states),
    db.select({ id: customAreas.id, organizationId: customAreas.organizationId }).from(customAreas),
    db.select({ organizationId: subscriptions.organizationId, planId: subscriptions.planId, status: subscriptions.status }).from(subscriptions),
    db.select({ id: plans.id, features: plans.features, limits: plans.limits }).from(plans),
  ]);
  return selectReportScopes({ stateIds: stateRows.map((s) => s.id), areas: areaRows, subscriptions: subRows, plans: planRows });
}
