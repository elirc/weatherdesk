import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customAreas, gridCells, lgas, settlements, states } from "./geo";

export const reportTypeEnum = pgEnum("report_type", ["weekly", "monthly"]);
export const reportScopeEnum = pgEnum("report_scope", ["national", "state", "custom_area"]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "preliminary", "final"]);

/**
 * scopeKey encodes the scope for uniqueness: 'national' | 'state:<stateId>' | 'area:<customAreaId>'.
 * Branded org copies reference the same periods with organizationId set.
 */
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    type: reportTypeEnum("type").notNull(),
    scopeType: reportScopeEnum("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    stateId: integer("state_id").references(() => states.id),
    customAreaId: text("custom_area_id").references(() => customAreas.id),
    organizationId: text("organization_id"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    /** computed numbers, tables and map series — the single source for web, PDF and narrative */
    content: jsonb("content").notNull(),
    /** template-generated narrative; editors may edit */
    narrative: text("narrative").notNull().default(""),
    pdfKey: text("pdf_key"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    correctionNote: text("correction_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_unique_idx").on(t.type, t.scopeKey, t.periodStart, t.organizationId),
    index("reports_period_idx").on(t.periodStart),
    index("reports_scope_idx").on(t.scopeKey),
  ],
);

export const savedPlaceKindEnum = pgEnum("place_kind", ["state", "lga", "settlement", "point"]);

export const savedPlaces = pgTable(
  "saved_places",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    kind: savedPlaceKindEnum("kind").notNull(),
    stateId: integer("state_id").references(() => states.id),
    lgaId: integer("lga_id").references(() => lgas.id),
    settlementId: integer("settlement_id").references(() => settlements.id),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_places_user_idx").on(t.userId)],
);

export const reportSubscriptions = pgTable(
  "report_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    reportType: reportTypeEnum("report_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    channel: text("channel").notNull().default("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("report_subs_unique_idx").on(t.userId, t.reportType, t.scopeKey)],
);

/** Paid personal add-on: daily forecast by SMS/WhatsApp at a chosen local time. */
export const dailySendSubscriptions = pgTable(
  "daily_send_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    savedPlaceId: text("saved_place_id").notNull(),
    channel: text("channel").notNull(), // 'sms' | 'whatsapp'
    phone: text("phone").notNull(),
    /** Africa/Lagos local time of day */
    sendTimeLocal: time("send_time_local").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("daily_send_user_idx").on(t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(), // 'alert' | 'report' | 'daily_forecast' | ...
    channel: text("channel").notNull(), // 'email' | 'sms' | 'whatsapp'
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'failed'
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Editor messages pinned to pages. */
export const notices = pgTable("notices", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** 'global' | 'home' | 'alerts' | 'reports' | 'place:<kind>:<id>' */
  scope: text("scope").notNull().default("global"),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
