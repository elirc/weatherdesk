ALTER TABLE "invitations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lgas_geom_gist" ON "lgas" USING gist ("geom");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "states_geom_gist" ON "states" USING gist ("geom");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_areas_geom_gist" ON "custom_areas" USING gist ("geom");