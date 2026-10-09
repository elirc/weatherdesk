import "server-only";
import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  alertRules,
  apiKeys,
  apiUsage,
  auditLog,
  customAreas,
  jobRuns,
  members,
  notices,
  organizations,
  plans,
  reports,
  sourceHealth,
  states,
  subscriptions,
  users,
} from "@/db/schema";
import type { ReportContent } from "@/reports/content-types";

/**
 * Staff (editor + platform admin) data access. Callers MUST have run
 * requireEditor / requireAdmin first — nothing here re-checks the session.
 * Unlike src/server/queries/reports.ts, report reads here are NOT limited to
 * public rows (staff see drafts, unpublished and branded org copies).
 * jsonb `sql` fragments mirror A4's public queries (svgs stripped in SQL).
 */

// ============================================================== reports

export type StaffReportFilters = {
  type?: "weekly" | "monthly";
  status?: "draft" | "preliminary" | "final";
  scope?: "national" | "state" | "custom_area";
  published?: "yes" | "no";
  /** YYYY-MM-DD bounds on periodStart */
  from?: string;
  to?: string;
};

export type StaffReportRow = {
  id: string;
  type: "weekly" | "monthly";
  scopeType: "national" | "state" | "custom_area";
  scopeKey: string;
  scopeLabel: string;
  organizationId: string | null;
  organizationName: string | null;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "preliminary" | "final";
  publishedAt: Date | null;
  hasPdf: boolean;
  narrativeEdited: boolean;
  correctionNote: string | null;
  updatedAt: Date;
};

const narrativeEditedSql = sql<boolean>`(${reports.content} ? 'generatedNarrative' and ${reports.narrative} <> coalesce(${reports.content}->>'generatedNarrative', ''))`;

export async function listStaffReports(f: StaffReportFilters, limit = 500): Promise<StaffReportRow[]> {
  const where: SQL[] = [];
  if (f.type) where.push(eq(reports.type, f.type));
  if (f.status) where.push(eq(reports.status, f.status));
  if (f.scope) where.push(eq(reports.scopeType, f.scope));
  if (f.published === "yes") where.push(isNotNull(reports.publishedAt));
  if (f.published === "no") where.push(isNull(reports.publishedAt));
  if (f.from) where.push(gte(reports.periodStart, f.from));
  if (f.to) where.push(lte(reports.periodStart, f.to));
  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeType: reports.scopeType,
      scopeKey: reports.scopeKey,
      contentScopeLabel: sql<string | null>`${reports.content}->>'scopeLabel'`,
      stateName: states.name,
      organizationId: reports.organizationId,
      organizationName: organizations.name,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      publishedAt: reports.publishedAt,
      pdfKey: reports.pdfKey,
      narrativeEdited: narrativeEditedSql,
      correctionNote: reports.correctionNote,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(states, eq(states.id, reports.stateId))
    .leftJoin(organizations, eq(organizations.id, reports.organizationId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(reports.periodStart), asc(reports.type), asc(reports.scopeKey))
    .limit(limit);
  return rows.map(({ contentScopeLabel, stateName, pdfKey, ...r }) => ({
    ...r,
    scopeLabel: contentScopeLabel ?? (r.scopeType === "national" ? "Nigeria" : stateName ?? r.scopeKey),
    hasPdf: !!pdfKey,
    narrativeEdited: !!r.narrativeEdited,
  }));
}

export type StaffReportDetail = StaffReportRow & {
  content: Partial<Omit<ReportContent, "svgs">>;
  maps: { key: string; title: string }[];
  narrative: string;
  generatedNarrative: string | null;
  pdfKey: string | null;
  createdAt: Date;
};

export async function getStaffReport(id: string): Promise<StaffReportDetail | null> {
  if (!id || id.length > 64) return null;
  const [r] = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeType: reports.scopeType,
      scopeKey: reports.scopeKey,
      stateName: states.name,
      organizationId: reports.organizationId,
      organizationName: organizations.name,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      publishedAt: reports.publishedAt,
      pdfKey: reports.pdfKey,
      narrativeEdited: narrativeEditedSql,
      correctionNote: reports.correctionNote,
      updatedAt: reports.updatedAt,
      createdAt: reports.createdAt,
      narrative: reports.narrative,
      content: sql<unknown>`${reports.content} - 'svgs'`,
      maps: sql<{ key: string; title: string }[] | null>`(
        select coalesce(jsonb_agg(jsonb_build_object('key', s->>'key', 'title', s->>'title') order by ord), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(${reports.content}->'svgs') = 'array'
          then ${reports.content}->'svgs' else '[]'::jsonb end) with ordinality as t(s, ord)
        where s->>'key' is not null
      )`,
    })
    .from(reports)
    .leftJoin(states, eq(states.id, reports.stateId))
    .leftJoin(organizations, eq(organizations.id, reports.organizationId))
    .where(eq(reports.id, id))
    .limit(1);
  if (!r) return null;
  const content = (r.content ?? {}) as Partial<Omit<ReportContent, "svgs">>;
  const { stateName, ...rest } = r;
  return {
    ...rest,
    content,
    maps: r.maps ?? [],
    hasPdf: !!r.pdfKey,
    narrativeEdited: !!r.narrativeEdited,
    generatedNarrative: typeof content.generatedNarrative === "string" ? content.generatedNarrative : null,
    scopeLabel: content.scopeLabel ?? (r.scopeType === "national" ? "Nigeria" : stateName ?? r.scopeKey),
  };
}

/** One map SVG of ANY report (staff preview; caller sanitizes). */
export async function getStaffReportSvg(id: string, key: string): Promise<string | null> {
  if (!id || id.length > 64 || !key || key.length > 64) return null;
  const [r] = await db
    .select({
      svg: sql<string | null>`(
        select s->>'svg' from jsonb_array_elements(case when jsonb_typeof(${reports.content}->'svgs') = 'array'
          then ${reports.content}->'svgs' else '[]'::jsonb end) as t(s)
        where s->>'key' = ${key} limit 1)`,
    })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);
  return r?.svg ?? null;
}

export async function updateReportNarrative(id: string, narrative: string): Promise<{ previousLength: number } | null> {
  const [prev] = await db.select({ narrative: reports.narrative }).from(reports).where(eq(reports.id, id)).limit(1);
  if (!prev) return null;
  await db.update(reports).set({ narrative, updatedAt: new Date() }).where(eq(reports.id, id));
  return { previousLength: prev.narrative.length };
}

export async function updateReportCorrection(id: string, correctionNote: string | null): Promise<boolean> {
  const res = await db
    .update(reports)
    .set({ correctionNote, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });
  return res.length > 0;
}

export async function setReportPublished(
  id: string,
  input: { publishedAt: Date | null; status?: "preliminary" | "final" },
): Promise<boolean> {
  const res = await db
    .update(reports)
    .set({ publishedAt: input.publishedAt, ...(input.status ? { status: input.status } : {}), updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning({ id: reports.id });
  return res.length > 0;
}

export async function getReportCore(id: string) {
  const [r] = await db
    .select({
      id: reports.id,
      type: reports.type,
      scopeKey: reports.scopeKey,
      periodStart: reports.periodStart,
      status: reports.status,
      organizationId: reports.organizationId,
      publishedAt: reports.publishedAt,
    })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);
  return r ?? null;
}

// ============================================================== alert rules

export async function listAlertRules() {
  return db
    .select({
      id: alertRules.id,
      type: alertRules.type,
      threshold: alertRules.threshold,
      severity: alertRules.severity,
      template: alertRules.template,
      enabled: alertRules.enabled,
      updatedAt: alertRules.updatedAt,
      updatedByEmail: users.email,
    })
    .from(alertRules)
    .leftJoin(users, eq(users.id, alertRules.updatedBy))
    .orderBy(asc(alertRules.type));
}

export async function getAlertRule(id: string) {
  const [r] = await db.select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
  return r ?? null;
}

export async function updateAlertRule(
  id: string,
  input: { threshold: number; severity: "moderate" | "high"; enabled: boolean; template: string },
  actorUserId: string,
): Promise<void> {
  await db
    .update(alertRules)
    .set({ ...input, updatedBy: actorUserId, updatedAt: new Date() })
    .where(eq(alertRules.id, id));
}

// ============================================================== notices

export async function listNotices() {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      body: notices.body,
      scope: notices.scope,
      active: notices.active,
      createdAt: notices.createdAt,
      expiresAt: notices.expiresAt,
      createdByEmail: users.email,
    })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.createdBy))
    .orderBy(desc(notices.active), desc(notices.createdAt));
}

export async function getNotice(id: string) {
  const [r] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
  return r ?? null;
}

export async function insertNotice(input: {
  id: string;
  title: string;
  body: string;
  scope: string;
  active: boolean;
  expiresAt: Date | null;
  createdBy: string;
}): Promise<void> {
  await db.insert(notices).values(input);
}

export async function updateNotice(
  id: string,
  input: Partial<{ title: string; body: string; scope: string; active: boolean; expiresAt: Date | null }>,
): Promise<boolean> {
  const res = await db.update(notices).set(input).where(eq(notices.id, id)).returning({ id: notices.id });
  return res.length > 0;
}

// ============================================================== health

export async function listSourceHealth() {
  return db.select().from(sourceHealth).orderBy(asc(sourceHealth.source));
}

// ============================================================== jobs

export type JobRunFilters = { name?: string; status?: "running" | "ok" | "failed"; page?: number };
export const JOB_PAGE_SIZE = 50;

export async function listJobRuns(f: JobRunFilters) {
  const where: SQL[] = [];
  if (f.name) where.push(eq(jobRuns.name, f.name));
  if (f.status) where.push(eq(jobRuns.status, f.status));
  const page = Math.max(1, f.page ?? 1);
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(jobRuns)
      .where(cond)
      .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
      .limit(JOB_PAGE_SIZE)
      .offset((page - 1) * JOB_PAGE_SIZE),
    db.select({ total: count() }).from(jobRuns).where(cond),
  ]);
  return { rows, total, page, pageSize: JOB_PAGE_SIZE };
}

export async function listJobNames(): Promise<string[]> {
  const rows = await db.selectDistinct({ name: jobRuns.name }).from(jobRuns).orderBy(asc(jobRuns.name));
  return rows.map((r) => r.name);
}

export async function getJobRun(id: number) {
  const [r] = await db.select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
  return r ?? null;
}

// ============================================================== users

export async function searchUsers(q: string | undefined, limit = 100) {
  const term = q?.trim();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      orgCount: sql<number>`(select count(*)::int from ${members} where ${members.userId} = ${users.id})`,
    })
    .from(users)
    .where(term ? or(ilike(users.email, `%${term}%`), ilike(users.name, `%${term}%`)) : undefined)
    .orderBy(asc(users.email))
    .limit(limit);
}

export async function getUserRole(id: string): Promise<{ id: string; email: string; role: string } | null> {
  const [r] = await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  return r ?? null;
}

export async function setUserRole(id: string, role: string): Promise<void> {
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

// ============================================================== organisations

export async function listOrganisations() {
  const latestSub = db
    .selectDistinctOn([subscriptions.organizationId], {
      organizationId: subscriptions.organizationId,
      planId: subscriptions.planId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(isNotNull(subscriptions.organizationId))
    .orderBy(subscriptions.organizationId, desc(subscriptions.updatedAt))
    .as("latest_sub");
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      planId: latestSub.planId,
      planName: plans.name,
      subStatus: latestSub.status,
      currentPeriodEnd: latestSub.currentPeriodEnd,
      memberCount: sql<number>`(select count(*)::int from ${members} where ${members.organizationId} = ${organizations.id})`,
      customAreaCount: sql<number>`(select count(*)::int from ${customAreas} where ${customAreas.organizationId} = ${organizations.id})`,
      activeKeyCount: sql<number>`(select count(*)::int from ${apiKeys} where ${apiKeys.organizationId} = ${organizations.id} and ${apiKeys.revokedAt} is null)`,
    })
    .from(organizations)
    .leftJoin(latestSub, eq(latestSub.organizationId, organizations.id))
    .leftJoin(plans, eq(plans.id, latestSub.planId))
    .orderBy(asc(organizations.name));
}

// ============================================================== plans

export async function listPlans() {
  return db.select().from(plans).orderBy(asc(plans.kind), asc(plans.priceKoboMonthly));
}

export async function getPlan(id: string) {
  const [r] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return r ?? null;
}

export async function updatePlan(
  id: string,
  input: { priceKoboMonthly: number; limits: Record<string, unknown>; active: boolean },
): Promise<void> {
  await db.update(plans).set(input).where(eq(plans.id, id));
}

// ============================================================== api usage

/** Per-org/day totals since `fromDay` (inclusive, YYYY-MM-DD). */
export async function apiUsageByOrgDay(fromDay: string) {
  return db
    .select({
      day: apiUsage.day,
      organizationId: apiKeys.organizationId,
      organizationName: organizations.name,
      total: sql<number>`sum(${apiUsage.count})::int`,
    })
    .from(apiUsage)
    .innerJoin(apiKeys, eq(apiKeys.id, apiUsage.apiKeyId))
    .leftJoin(organizations, eq(organizations.id, apiKeys.organizationId))
    .where(gte(apiUsage.day, fromDay))
    .groupBy(apiUsage.day, apiKeys.organizationId, organizations.name)
    .orderBy(asc(apiUsage.day));
}

export async function topApiKeys(fromDay: string, limit = 20) {
  return db
    .select({
      apiKeyId: apiKeys.id,
      keyName: apiKeys.name,
      prefix: apiKeys.prefix,
      revokedAt: apiKeys.revokedAt,
      lastUsedAt: apiKeys.lastUsedAt,
      organizationName: organizations.name,
      total: sql<number>`sum(${apiUsage.count})::int`,
      endpoints: sql<number>`count(distinct ${apiUsage.endpoint})::int`,
    })
    .from(apiUsage)
    .innerJoin(apiKeys, eq(apiKeys.id, apiUsage.apiKeyId))
    .leftJoin(organizations, eq(organizations.id, apiKeys.organizationId))
    .where(gte(apiUsage.day, fromDay))
    .groupBy(apiKeys.id, apiKeys.name, apiKeys.prefix, apiKeys.revokedAt, apiKeys.lastUsedAt, organizations.name)
    .orderBy(desc(sql`sum(${apiUsage.count})`))
    .limit(limit);
}

// ============================================================== audit

export type AuditFilters = {
  action?: string;
  entity?: string;
  /** actor email substring */
  actor?: string;
  /** UTC instants (Lagos day bounds computed by caller) */
  from?: Date;
  to?: Date;
  page?: number;
};
export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(f: AuditFilters) {
  const where: SQL[] = [];
  if (f.action) where.push(ilike(auditLog.action, `%${f.action}%`));
  if (f.entity) where.push(eq(auditLog.entity, f.entity));
  if (f.actor) where.push(ilike(users.email, `%${f.actor}%`));
  if (f.from) where.push(gte(auditLog.createdAt, f.from));
  if (f.to) where.push(sql`${auditLog.createdAt} < ${f.to}`);
  const cond = where.length ? and(...where) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        details: auditLog.details,
        createdAt: auditLog.createdAt,
        actorEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(cond)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorUserId)).where(cond),
  ]);
  return { rows, total, page, pageSize: AUDIT_PAGE_SIZE };
}

export async function listAuditEntities(): Promise<string[]> {
  const rows = await db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity));
  return rows.map((r) => r.entity);
}

// ============================================================== overview

export async function staffOverviewCounts() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [[unpublished], [activeNotices], [failedJobs], [disabledRules]] = await Promise.all([
    db.select({ n: count() }).from(reports).where(isNull(reports.publishedAt)),
    db.select({ n: count() }).from(notices).where(eq(notices.active, true)),
    db.select({ n: count() }).from(jobRuns).where(and(eq(jobRuns.status, "failed"), gte(jobRuns.startedAt, since))),
    db.select({ n: count() }).from(alertRules).where(eq(alertRules.enabled, false)),
  ]);
  return {
    unpublishedReports: unpublished.n,
    activeNotices: activeNotices.n,
    failedJobs24h: failedJobs.n,
    disabledRules: disabledRules.n,
  };
}
