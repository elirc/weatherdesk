import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5440/weatherdesk_dev",
  },
  // PostGIS system tables must not be managed by drizzle
  tablesFilter: ["!spatial_ref_sys", "!geography_columns", "!geometry_columns"],
});
