import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { lgas } from "./geo";

export const alertTypeEnum = pgEnum("alert_type", [
  "heavy_rain",
  "heat",
  "wind",
  "dry_spell",
]);

export const alertSeverityEnum = pgEnum("alert_severity", ["moderate", "high"]);

/** Editor-tunable thresholds. Seeded: rain ≥50mm/day, heat ≥40°C, gusts ≥60km/h, dry spell ≥10 days in season. */
export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  type: alertTypeEnum("type").notNull(),
  threshold: real("threshold").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("moderate"),
  /** fixed template, placeholders like {lga}, {value}, {threshold}, {date} */
  template: text("template").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Issued advisories (NOT official warnings — label everywhere). */
export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    lgaId: integer("lga_id")
      .notNull()
      .references(() => lgas.id),
    ruleId: text("rule_id").references(() => alertRules.id),
    type: alertTypeEnum("type").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alerts_lga_valid_idx").on(t.lgaId, t.validTo),
    index("alerts_valid_to_idx").on(t.validTo),
  ],
);
