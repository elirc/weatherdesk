import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Forecast accuracy by calendar month × geopolitical zone × lead day. */
export const accuracyStats = pgTable(
  "accuracy_stats",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** first day of the calendar month the stats cover */
    month: date("month").notNull(),
    zone: text("zone").notNull(), // geo zone slug or 'national'
    leadDays: smallint("lead_days").notNull(),
    maeTmax: real("mae_tmax"),
    maeTmin: real("mae_tmin"),
    /** share of rain / no-rain calls that verified (0..1) */
    rainHitRate: real("rain_hit_rate"),
    nSamples: integer("n_samples").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accuracy_unique_idx").on(t.month, t.zone, t.leadDays)],
);

export const sourceHealth = pgTable("source_health", {
  source: text("source").primaryKey(), // 'open-meteo' | 'nasa-power' | 'termii' | 'resend' | 'paystack' | 'google-weather'
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  latencyMs: integer("latency_ms"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  /** budget tracking: 'YYYY-MM' + calls made */
  monthKey: text("month_key"),
  callsThisMonth: integer("calls_this_month").notNull().default(0),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"), // running | ok | failed
    error: text("error"),
    details: jsonb("details"),
  },
  (t) => [index("job_runs_name_idx").on(t.name, t.startedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(), // e.g. 'report.publish', 'alert_rule.update'
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)],
);
