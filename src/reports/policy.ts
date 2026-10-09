/**
 * Pure publishing policy for the report engine (DB-free, unit-tested).
 */

export type ReportStatus = "draft" | "preliminary" | "final";

/**
 * Status + publishedAt for a (re)generated report.
 * - weekly: no preliminary phase → final, published immediately (a
 *   regeneration keeps the original publishedAt).
 * - monthly 'preliminary' → preliminary + publishedAt; never downgrades a
 *   row that is already final.
 * - monthly 'final' → final with publishedAt refreshed.
 */
export function decideStatus(
  type: "weekly" | "monthly",
  phase: "preliminary" | "final" | undefined,
  existing: { status: ReportStatus; publishedAt: Date | null } | null,
  now: Date,
): { status: ReportStatus; publishedAt: Date } {
  if (type === "weekly") return { status: "final", publishedAt: existing?.publishedAt ?? now };
  if ((phase ?? "preliminary") === "final") return { status: "final", publishedAt: now };
  if (existing?.status === "final") return { status: "final", publishedAt: existing.publishedAt ?? now };
  return { status: "preliminary", publishedAt: existing?.publishedAt ?? now };
}

/**
 * Editor edits survive regeneration: the stored narrative is replaced only
 * while it still equals the template text the engine generated last time
 * (content.generatedNarrative). Rows without that marker are treated as
 * unedited only when their narrative is empty.
 */
export function decideNarrative(
  existing: { narrative: string; generatedNarrative: string | undefined } | null,
  generated: string,
): { narrative: string; keptEditorText: boolean } {
  if (!existing) return { narrative: generated, keptEditorText: false };
  const unedited =
    existing.narrative === "" ||
    (existing.generatedNarrative !== undefined && existing.narrative === existing.generatedNarrative);
  return unedited ? { narrative: generated, keptEditorText: false } : { narrative: existing.narrative, keptEditorText: true };
}

/** Subscription statuses that entitle an org to its plan features. */
export const ENTITLED_SUB_STATUSES = ["active", "trialing"] as const;

/**
 * Scheduled scopes: 'national', every state, and custom areas of orgs whose
 * entitled subscription's plan has brandedReports (in features or limits).
 */
export function selectReportScopes(input: {
  stateIds: number[];
  areas: { id: string; organizationId: string }[];
  subscriptions: { organizationId: string | null; planId: string; status: string }[];
  plans: { id: string; features: unknown; limits: unknown }[];
}): string[] {
  const branded = new Set(
    input.plans
      .filter((p) => flag(p.features, "brandedReports") || flag(p.limits, "brandedReports"))
      .map((p) => p.id),
  );
  const orgs = new Set(
    input.subscriptions
      .filter(
        (s) =>
          s.organizationId &&
          (ENTITLED_SUB_STATUSES as readonly string[]).includes(s.status) &&
          branded.has(s.planId),
      )
      .map((s) => s.organizationId as string),
  );
  return [
    "national",
    ...[...input.stateIds].sort((a, b) => a - b).map((id) => `state:${id}`),
    ...input.areas
      .filter((a) => orgs.has(a.organizationId))
      .map((a) => a.id)
      .sort()
      .map((id) => `area:${id}`),
  ];
}

function flag(obj: unknown, key: string): boolean {
  return !!obj && typeof obj === "object" && (obj as Record<string, unknown>)[key] === true;
}

/** Email attachment cap for report PDFs. */
export const PDF_ATTACH_MAX_BYTES = 2 * 1024 * 1024;

/** Storage key for a report PDF. */
export function pdfKeyFor(periodStart: string, reportId: string): string {
  return `reports/${periodStart.slice(0, 4)}/${reportId}.pdf`;
}
