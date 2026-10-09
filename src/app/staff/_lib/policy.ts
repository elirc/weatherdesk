/**
 * Pure staff-tool policy (DB-free; unit-tested in tests/unit/staff).
 * Threshold ranges, role-change guard, job retry payload mapping, notice
 * scope + date handling, template preview, health classification.
 */
import { z } from "zod";
import type { JobName, JobPayloads } from "@/lib/queue";
import { addDaysIso, lagosDateOf, lagosMidnightUtc } from "@/lib/time";

// ---------------------------------------------------------------- alert rules

export const ALERT_TYPES = ["heavy_rain", "heat", "wind", "dry_spell"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Editor-allowed threshold ranges (inclusive) per rule type. */
export const THRESHOLD_RANGES: Record<AlertType, { min: number; max: number; unit: string; label: string }> = {
  heavy_rain: { min: 10, max: 200, unit: "mm", label: "Heavy rain (daily total)" },
  heat: { min: 35, max: 50, unit: "°C", label: "Heat (max temperature)" },
  wind: { min: 30, max: 150, unit: "km/h", label: "Wind (gusts)" },
  dry_spell: { min: 5, max: 30, unit: "days", label: "Dry spell (consecutive days < 1 mm)" },
};

export function validateThreshold(
  type: AlertType,
  value: number,
): { ok: true } | { ok: false; error: string } {
  const r = THRESHOLD_RANGES[type];
  if (!Number.isFinite(value)) return { ok: false, error: "Threshold must be a number" };
  if (value < r.min || value > r.max) {
    return { ok: false, error: `${r.label} threshold must be between ${r.min} and ${r.max} ${r.unit}` };
  }
  if (type === "dry_spell" && !Number.isInteger(value)) {
    return { ok: false, error: "Dry spell threshold must be a whole number of days" };
  }
  return { ok: true };
}

export const TEMPLATE_PLACEHOLDERS = ["{lga}", "{value}", "{threshold}", "{date}"] as const;

export const SAMPLE_TEMPLATE_VALUES: Record<AlertType, { lga: string; value: string; date: string }> = {
  heavy_rain: { lga: "Ikeja", value: "72", date: "Thu, 9 Oct" },
  heat: { lga: "Maiduguri", value: "42", date: "Thu, 9 Oct" },
  wind: { lga: "Kano Municipal", value: "75", date: "Thu, 9 Oct" },
  dry_spell: { lga: "Sokoto North", value: "12", date: "Thu, 9 Oct" },
};

/** Fill {lga} {value} {threshold} {date}; unknown placeholders are left as-is. */
export function renderTemplatePreview(
  template: string,
  values: { lga: string; value: string; threshold: string; date: string },
): string {
  return template.replace(/\{(lga|value|threshold|date)\}/g, (_, k: keyof typeof values) => values[k]);
}

/** Placeholders in a template that are not in the supported legend. */
export function unknownPlaceholders(template: string): string[] {
  const found = template.match(/\{[^{}]*\}/g) ?? [];
  return [...new Set(found.filter((p) => !(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(p)))];
}

export const alertRuleUpdateSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(ALERT_TYPES),
    threshold: z.coerce.number(),
    severity: z.enum(["moderate", "high"]),
    enabled: z.boolean(),
    template: z.string().trim().min(10, "Template is too short").max(600, "Template is too long"),
  })
  .superRefine((v, ctx) => {
    const t = validateThreshold(v.type, v.threshold);
    if (!t.ok) ctx.addIssue({ code: "custom", path: ["threshold"], message: t.error });
    const unknown = unknownPlaceholders(v.template);
    if (unknown.length) {
      ctx.addIssue({ code: "custom", path: ["template"], message: `Unknown placeholder(s): ${unknown.join(", ")}` });
    }
  });

// ---------------------------------------------------------------- users

export const ROLES = ["user", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Role change guard: admins only (enforced by requireAdmin at the call site);
 * nobody may change their own role (prevents locking the last admin out by
 * accident — another admin must do it).
 */
export function checkRoleChange(input: {
  actorId: string;
  targetId: string;
  currentRole: string;
  newRole: Role;
}): { ok: true } | { ok: false; error: string } {
  if (input.actorId === input.targetId && input.newRole !== input.currentRole) {
    return { ok: false, error: "You cannot change your own role" };
  }
  if (input.currentRole === input.newRole) return { ok: false, error: "Role is unchanged" };
  return { ok: true };
}

// ---------------------------------------------------------------- jobs

/** Payload schemas for replaying a stored job run (job_runs.details.data). */
const RETRY_SCHEMAS: { [N in JobName]: z.ZodType<JobPayloads[N]> } = {
  "forecast.refresh": z.object({}).strip() as unknown as z.ZodType<Record<string, never>>,
  "forecast.fetch-chunk": z.object({ gridCellIds: z.array(z.number().int()).min(1) }),
  "daily.pipeline": z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  "history.backfill-cell": z.object({
    gridCellId: z.number().int(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  "normals.compute-cell": z.object({ gridCellId: z.number().int() }),
  "cell.activate": z.object({ lat: z.number(), lon: z.number() }),
  "reports.weekly": z.object({ periodStart: z.string().optional() }),
  "reports.monthly": z.object({ month: z.string().optional(), phase: z.enum(["preliminary", "final"]) }),
  "report.generate": z.object({
    type: z.enum(["weekly", "monthly"]),
    scopeKey: z.string().min(1),
    periodStart: z.string(),
    phase: z.enum(["preliminary", "final"]).optional(),
    organizationId: z.string().optional(),
  }),
  "report.render-pdf": z.object({ reportId: z.string().min(1) }),
  "notification.send": z.object({ notificationId: z.string().min(1) }),
  "daily-send.tick": z.object({}).strip() as unknown as z.ZodType<Record<string, never>>,
};

const JOB_NAMES = new Set<string>(Object.keys(RETRY_SCHEMAS));

export function isJobName(name: string): name is JobName {
  return JOB_NAMES.has(name);
}

export type RetryPlan = { ok: true; name: JobName; data: object } | { ok: false; reason: string };

/**
 * Map a job_runs row to a replayable sendJob call. The worker stores
 * `details = { jobId, data }` for every run (src/worker/index.ts); runs
 * without a parseable payload are not retryable.
 */
export function retryPlanFor(run: { name: string; details: unknown }): RetryPlan {
  if (!isJobName(run.name)) return { ok: false, reason: `Unknown job "${run.name}"` };
  const details = run.details;
  if (!details || typeof details !== "object" || !("data" in details)) {
    return { ok: false, reason: "No stored payload for this run" };
  }
  const parsed = RETRY_SCHEMAS[run.name].safeParse((details as { data: unknown }).data ?? {});
  if (!parsed.success) return { ok: false, reason: "Stored payload does not match the job contract" };
  return { ok: true, name: run.name, data: parsed.data as object };
}

/** The "Run now" set for platform admins. */
export const RUN_NOW: { key: string; label: string; name: JobName; data: object }[] = [
  { key: "forecast", label: "Forecast refresh", name: "forecast.refresh", data: {} },
  { key: "daily", label: "Daily pipeline", name: "daily.pipeline", data: {} },
  { key: "weekly", label: "Weekly reports", name: "reports.weekly", data: {} },
  { key: "monthly-prelim", label: "Monthly reports (preliminary)", name: "reports.monthly", data: { phase: "preliminary" } },
  { key: "monthly-final", label: "Monthly reports (final)", name: "reports.monthly", data: { phase: "final" } },
];

// ---------------------------------------------------------------- reports

/** Params for a report regenerate job from a reports row. */
export function regeneratePayload(r: {
  type: "weekly" | "monthly";
  scopeKey: string;
  periodStart: string;
  status: string;
  organizationId: string | null;
}): JobPayloads["report.generate"] {
  return {
    type: r.type,
    scopeKey: r.scopeKey,
    periodStart: r.periodStart,
    ...(r.type === "monthly" ? { phase: r.status === "final" ? ("final" as const) : ("preliminary" as const) } : {}),
    ...(r.organizationId ? { organizationId: r.organizationId } : {}),
  };
}

/**
 * Status to set when publishing: a preliminary monthly reviewed by an
 * editor may be promoted to final; drafts become final (weekly) or
 * preliminary (monthly) — otherwise the status is kept.
 */
export function statusOnPublish(type: "weekly" | "monthly", current: string, promoteToFinal: boolean): "preliminary" | "final" {
  if (current === "final") return "final";
  if (type === "weekly") return "final";
  if (promoteToFinal) return "final";
  return "preliminary";
}

// ---------------------------------------------------------------- notices

export const NOTICE_FIXED_SCOPES = ["global", "home", "alerts", "reports"] as const;

/**
 * 'global' | 'home' | 'alerts' | 'reports' | 'place:<kind>:<numeric id>'
 * (matches the public place pages' noticeScope, src/app/(public)/place/resolve.ts).
 */
export const noticeScopeSchema = z
  .string()
  .trim()
  .refine(
    (s) => (NOTICE_FIXED_SCOPES as readonly string[]).includes(s) || /^place:(state|lga|settlement):\d{1,10}$/.test(s),
    { message: "Scope must be global, home, alerts, reports or place:<state|lga|settlement>:<id>" },
  );

/**
 * Lagos civil date (date input, YYYY-MM-DD) → UTC instant at the END of that
 * Lagos day (i.e. midnight starting the next day). Empty → null (no expiry).
 */
export function lagosDateInputToExpiry(date: string | null | undefined): Date | null {
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  return lagosMidnightUtc(addDaysIso(date, 1));
}

/** Inverse of lagosDateInputToExpiry for prefilling the date input. */
export function expiryToLagosDateInput(d: Date | null): string {
  if (!d) return "";
  // expiry is midnight Lagos of the following day → the civil date 1 ms earlier
  return lagosDateOf(new Date(d.getTime() - 1));
}

export const noticeInputSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(120),
  body: z.string().trim().min(3, "Body is too short").max(2000),
  scope: noticeScopeSchema,
  active: z.boolean(),
  expiresOn: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Invalid date")
    .optional(),
});

// ---------------------------------------------------------------- plans

export const planUpdateSchema = z.object({
  id: z.string().min(1),
  priceNaira: z.coerce.number().min(0).max(100_000_000),
  apiCallsPerDay: z.coerce.number().int().min(0).max(100_000_000),
  customAreas: z.coerce.number().int().min(0).max(10_000),
  downloads: z.boolean(),
  brandedReports: z.boolean(),
  active: z.boolean(),
});

/** Merge typed limit edits over the stored JSON (other keys are preserved). */
export function mergePlanLimits(
  existing: unknown,
  edit: { apiCallsPerDay: number; customAreas: number; downloads: boolean; brandedReports: boolean },
): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, ...edit };
}

// ---------------------------------------------------------------- health

export const KNOWN_SOURCES = ["open-meteo", "nasa-power", "google-weather", "termii", "resend", "paystack"] as const;

export function isSourceUnhealthy(
  row: { consecutiveFailures: number; lastSuccessAt: Date | null },
  now = new Date(),
): boolean {
  if (row.consecutiveFailures >= 3) return true;
  if (!row.lastSuccessAt) return true;
  return now.getTime() - row.lastSuccessAt.getTime() > 24 * 60 * 60 * 1000;
}

/** Calls this month as % of budget (0..100, clamped); only counts the current month key. */
export function budgetPercent(
  row: { monthKey: string | null; callsThisMonth: number },
  budget: number,
  now = new Date(),
): { calls: number; pct: number } {
  const current = now.toISOString().slice(0, 7);
  const calls = row.monthKey === current ? row.callsThisMonth : 0;
  const pct = budget > 0 ? Math.min(100, Math.round((calls / budget) * 1000) / 10) : 0;
  return { calls, pct };
}

export function durationLabel(start: Date, end: Date | null): string {
  if (!end) return "—";
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 120) return `${s.toFixed(1)} s`;
  return `${Math.round(s / 60)} min`;
}

// ---------------------------------------------------------------- api usage

/**
 * Pivot per-org/day totals into chart rows: one row per day in `days` (zero
 * filled), one numeric column per organisation key. Orgs ordered by total desc;
 * beyond `maxSeries` they are folded into "other".
 */
export function pivotUsage(
  rows: { day: string; organizationId: string; organizationName: string | null; total: number }[],
  days: string[],
  maxSeries = 6,
): { data: Record<string, string | number>[]; series: { key: string; label: string }[] } {
  const totals = new Map<string, { label: string; total: number }>();
  for (const r of rows) {
    const t = totals.get(r.organizationId) ?? { label: r.organizationName ?? r.organizationId.slice(0, 8), total: 0 };
    t.total += r.total;
    totals.set(r.organizationId, t);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const kept = ranked.slice(0, maxSeries);
  const keyOf = new Map<string, string>();
  const series = kept.map(([id, t], i) => {
    keyOf.set(id, `s${i}`);
    return { key: `s${i}`, label: t.label };
  });
  if (ranked.length > maxSeries) series.push({ key: "other", label: "Other" });
  const byDay = new Map<string, Record<string, string | number>>();
  for (const d of days) {
    const row: Record<string, string | number> = { day: d };
    for (const s of series) row[s.key] = 0;
    byDay.set(d, row);
  }
  for (const r of rows) {
    const row = byDay.get(r.day);
    if (!row) continue;
    const k = keyOf.get(r.organizationId) ?? "other";
    row[k] = (row[k] as number) + r.total;
  }
  return { data: days.map((d) => byDay.get(d)!), series };
}

/** live | expired | inactive for a notice row. */
export function noticeStatus(active: boolean, expiresAt: Date | null, now = new Date()): "live" | "expired" | "inactive" {
  if (!active) return "inactive";
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired";
  return "live";
}
