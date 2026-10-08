import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const planKindEnum = pgEnum("plan_kind", ["org", "personal_addon"]);

/** Prices are placeholders (integer kobo). */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // slug: 'free' | 'org_basic' | 'org_pro' | 'sms_daily' ...
  name: text("name").notNull(),
  kind: planKindEnum("kind").notNull(),
  priceKoboMonthly: integer("price_kobo_monthly").notNull().default(0),
  /** e.g. { apiCallsPerDay, customAreas, teamMembers, downloads } */
  limits: jsonb("limits").notNull().default({}),
  features: jsonb("features").notNull().default({}),
  active: boolean("active").notNull().default(true),
  /** Paystack plan code when synced */
  paystackPlanCode: text("paystack_plan_code"),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    userId: text("user_id"),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("active"), // active | past_due | canceled | trialing
    paystackCustomerCode: text("paystack_customer_code"),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_org_idx").on(t.organizationId),
    index("subscriptions_user_idx").on(t.userId),
  ],
);

/** Keys are stored as SHA-256 hashes; plaintext shown once at creation. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    /** display prefix, e.g. 'wd_live_a1b2c3' */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_org_idx").on(t.organizationId)],
);

export const apiUsage = pgTable(
  "api_usage",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    apiKeyId: text("api_key_id").notNull(),
    day: date("day").notNull(),
    endpoint: text("endpoint").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("api_usage_unique_idx").on(t.apiKeyId, t.day, t.endpoint)],
);
