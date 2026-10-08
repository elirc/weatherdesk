CREATE TYPE "public"."custom_area_mode" AS ENUM('lga_set', 'polygon');--> statement-breakpoint
CREATE TYPE "public"."geo_zone" AS ENUM('north-west', 'north-east', 'north-central', 'south-west', 'south-east', 'south-south');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('moderate', 'high');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('heavy_rain', 'heat', 'wind', 'dry_spell');--> statement-breakpoint
CREATE TYPE "public"."report_scope" AS ENUM('national', 'state', 'custom_area');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'preliminary', 'final');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('state', 'lga', 'settlement', 'point');--> statement-breakpoint
CREATE TYPE "public"."plan_kind" AS ENUM('org', 'personal_addon');--> statement-breakpoint
CREATE TABLE "custom_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"mode" "custom_area_mode" NOT NULL,
	"lga_ids" integer[],
	"polygon_geojson" jsonb,
	"geom" geometry(MultiPolygon, 4326),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grid_cells" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grid_cells_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lat_idx" integer NOT NULL,
	"lon_idx" integer NOT NULL,
	"centre_lat" double precision NOT NULL,
	"centre_lon" double precision NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'lga' NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lgas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lgas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"state_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"zone" "geo_zone" NOT NULL,
	"centre_lat" double precision NOT NULL,
	"centre_lon" double precision NOT NULL,
	"grid_cell_id" integer,
	"boundary_geojson" jsonb NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgas_slug_unique" UNIQUE("slug"),
	CONSTRAINT "lgas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"lga_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"kind" text,
	"source" text DEFAULT 'fixture' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"zone" "geo_zone" NOT NULL,
	"centre_lat" double precision NOT NULL,
	"centre_lon" double precision NOT NULL,
	"boundary_geojson" jsonb NOT NULL,
	"geom" geometry(MultiPolygon, 4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "states_name_unique" UNIQUE("name"),
	CONSTRAINT "states_slug_unique" UNIQUE("slug"),
	CONSTRAINT "states_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "forecast_archive" (
	"grid_cell_id" integer NOT NULL,
	"issue_date" date NOT NULL,
	"target_date" date NOT NULL,
	"lead_days" smallint NOT NULL,
	"rain_mm" real,
	"rain_prob_pct" real,
	"tmax_c" real,
	"tmin_c" real,
	CONSTRAINT "forecast_archive_grid_cell_id_issue_date_target_date_pk" PRIMARY KEY("grid_cell_id","issue_date","target_date")
);
--> statement-breakpoint
CREATE TABLE "forecast_daily" (
	"grid_cell_id" integer NOT NULL,
	"date" date NOT NULL,
	"tmax_c" real,
	"tmin_c" real,
	"rain_mm" real,
	"rain_prob_pct" real,
	"wind_max_kmh" real,
	"gusts_max_kmh" real,
	"uv_index_max" real,
	"weather_code" smallint,
	"sunrise" timestamp with time zone,
	"sunset" timestamp with time zone,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "forecast_daily_grid_cell_id_date_pk" PRIMARY KEY("grid_cell_id","date")
);
--> statement-breakpoint
CREATE TABLE "forecast_hourly" (
	"grid_cell_id" integer NOT NULL,
	"valid_time" timestamp with time zone NOT NULL,
	"temperature_c" real,
	"feels_like_c" real,
	"humidity_pct" real,
	"rain_mm" real,
	"rain_prob_pct" real,
	"wind_speed_kmh" real,
	"wind_gusts_kmh" real,
	"wind_direction_deg" real,
	"cloud_cover_pct" real,
	"weather_code" smallint,
	"uv_index" real,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "forecast_hourly_grid_cell_id_valid_time_pk" PRIMARY KEY("grid_cell_id","valid_time")
);
--> statement-breakpoint
CREATE TABLE "normals_monthly" (
	"grid_cell_id" integer NOT NULL,
	"month" smallint NOT NULL,
	"rain_mm" real,
	"rainy_days" real,
	"tmax_c" real,
	"tmin_c" real,
	CONSTRAINT "normals_monthly_grid_cell_id_month_pk" PRIMARY KEY("grid_cell_id","month")
);
--> statement-breakpoint
CREATE TABLE "normals_season" (
	"grid_cell_id" integer PRIMARY KEY NOT NULL,
	"onset_doy" smallint,
	"cessation_doy" smallint,
	"season_length_days" smallint,
	"method" text DEFAULT 'agro_onset_v1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observed_daily" (
	"grid_cell_id" integer NOT NULL,
	"date" date NOT NULL,
	"rain_mm" real,
	"tmax_c" real,
	"tmin_c" real,
	"humidity_pct" real,
	"wind_kmh" real,
	"solar_mj_m2" real,
	"source" text NOT NULL,
	"preliminary" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observed_daily_grid_cell_id_date_pk" PRIMARY KEY("grid_cell_id","date")
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "alert_type" NOT NULL,
	"threshold" real NOT NULL,
	"severity" "alert_severity" DEFAULT 'moderate' NOT NULL,
	"template" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"lga_id" integer NOT NULL,
	"rule_id" text,
	"type" "alert_type" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_send_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"saved_place_id" text NOT NULL,
	"channel" text NOT NULL,
	"phone" text NOT NULL,
	"send_time_local" time NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"report_type" "report_type" NOT NULL,
	"scope_key" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "report_type" NOT NULL,
	"scope_type" "report_scope" NOT NULL,
	"scope_key" text NOT NULL,
	"state_id" integer,
	"custom_area_id" text,
	"organization_id" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"narrative" text DEFAULT '' NOT NULL,
	"pdf_key" text,
	"published_at" timestamp with time zone,
	"correction_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_places" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "place_kind" NOT NULL,
	"state_id" integer,
	"lga_id" integer,
	"settlement_id" integer,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"grid_cell_id" integer NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"api_key_id" text NOT NULL,
	"day" date NOT NULL,
	"endpoint" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "plan_kind" NOT NULL,
	"price_kobo_monthly" integer DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"paystack_plan_code" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paystack_customer_code" text,
	"paystack_subscription_code" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accuracy_stats" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accuracy_stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"month" date NOT NULL,
	"zone" text NOT NULL,
	"lead_days" smallint NOT NULL,
	"mae_tmax" real,
	"mae_tmin" real,
	"rain_hit_rate" real,
	"n_samples" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"source" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"latency_ms" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"month_key" text,
	"calls_this_month" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_archive" ADD CONSTRAINT "forecast_archive_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_daily" ADD CONSTRAINT "forecast_daily_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_hourly" ADD CONSTRAINT "forecast_hourly_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normals_monthly" ADD CONSTRAINT "normals_monthly_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normals_season" ADD CONSTRAINT "normals_season_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observed_daily" ADD CONSTRAINT "observed_daily_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_custom_area_id_custom_areas_id_fk" FOREIGN KEY ("custom_area_id") REFERENCES "public"."custom_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_grid_cell_id_grid_cells_id_fk" FOREIGN KEY ("grid_cell_id") REFERENCES "public"."grid_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_areas_org_idx" ON "custom_areas" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grid_cells_latlon_idx" ON "grid_cells" USING btree ("lat_idx","lon_idx");--> statement-breakpoint
CREATE INDEX "grid_cells_active_idx" ON "grid_cells" USING btree ("active");--> statement-breakpoint
CREATE INDEX "lgas_state_idx" ON "lgas" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "settlements_lga_idx" ON "settlements" USING btree ("lga_id");--> statement-breakpoint
CREATE INDEX "settlements_name_trgm_idx" ON "settlements" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "forecast_archive_target_idx" ON "forecast_archive" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "forecast_hourly_valid_idx" ON "forecast_hourly" USING btree ("valid_time");--> statement-breakpoint
CREATE INDEX "observed_daily_date_idx" ON "observed_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "alerts_lga_valid_idx" ON "alerts" USING btree ("lga_id","valid_to");--> statement-breakpoint
CREATE INDEX "alerts_valid_to_idx" ON "alerts" USING btree ("valid_to");--> statement-breakpoint
CREATE INDEX "daily_send_user_idx" ON "daily_send_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_subs_unique_idx" ON "report_subscriptions" USING btree ("user_id","report_type","scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_unique_idx" ON "reports" USING btree ("type","scope_key","period_start","organization_id");--> statement-breakpoint
CREATE INDEX "reports_period_idx" ON "reports" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "reports_scope_idx" ON "reports" USING btree ("scope_key");--> statement-breakpoint
CREATE INDEX "saved_places_user_idx" ON "saved_places" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_unique_idx" ON "api_usage" USING btree ("api_key_id","day","endpoint");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accuracy_unique_idx" ON "accuracy_stats" USING btree ("month","zone","lead_days");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "job_runs_name_idx" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_org_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");