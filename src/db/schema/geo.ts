import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** PostGIS geometry column. Values are exchanged as GeoJSON strings via ST_* in raw SQL. */
export const multiPolygon = customType<{ data: unknown }>({
  dataType() {
    return "geometry(MultiPolygon, 4326)";
  },
});

export const zoneEnum = pgEnum("geo_zone", [
  "north-west",
  "north-east",
  "north-central",
  "south-west",
  "south-east",
  "south-south",
]);

export const states = pgTable("states", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  /** ISO 3166-2 where available, e.g. NG-LA */
  code: text("code").notNull().unique(),
  zone: zoneEnum("zone").notNull(),
  centreLat: doublePrecision("centre_lat").notNull(),
  centreLon: doublePrecision("centre_lon").notNull(),
  /** simplified for map rendering (small; served to clients) */
  boundaryGeojson: jsonb("boundary_geojson").notNull(),
  geom: multiPolygon("geom"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lgas = pgTable(
  "lgas",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    stateId: integer("state_id")
      .notNull()
      .references(() => states.id),
    name: text("name").notNull(),
    /** globally unique, e.g. "ikeja" or "obi-benue" when names collide */
    slug: text("slug").notNull().unique(),
    /** stable external code (geoBoundaries shapeID or GRID3 code) */
    code: text("code").notNull().unique(),
    zone: zoneEnum("zone").notNull(),
    centreLat: doublePrecision("centre_lat").notNull(),
    centreLon: doublePrecision("centre_lon").notNull(),
    gridCellId: integer("grid_cell_id").references(() => gridCells.id),
    boundaryGeojson: jsonb("boundary_geojson").notNull(),
    geom: multiPolygon("geom"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lgas_state_idx").on(t.stateId)],
);

export const settlements = pgTable(
  "settlements",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    lgaId: integer("lga_id")
      .notNull()
      .references(() => lgas.id),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    kind: text("kind"),
    /** 'grid3' | 'fixture' */
    source: text("source").notNull().default("fixture"),
  },
  (t) => [
    index("settlements_lga_idx").on(t.lgaId),
    // trigram index for fuzzy search
    index("settlements_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

/** 0.1° grid (~11 km). latIdx = floor(lat*10), lonIdx = floor(lon*10). Centre = idx/10 + 0.05. */
export const gridCells = pgTable(
  "grid_cells",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    latIdx: integer("lat_idx").notNull(),
    lonIdx: integer("lon_idx").notNull(),
    centreLat: doublePrecision("centre_lat").notNull(),
    centreLon: doublePrecision("centre_lon").notNull(),
    /** active cells are refreshed by the 6-hourly forecast job */
    active: boolean("active").notNull().default(false),
    /** why it exists: 'lga' (LGA centre, permanent) | 'on_demand' */
    origin: text("origin").notNull().default("lga"),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("grid_cells_latlon_idx").on(t.latIdx, t.lonIdx),
    index("grid_cells_active_idx").on(t.active),
  ],
);

export const customAreaModeEnum = pgEnum("custom_area_mode", ["lga_set", "polygon"]);

export const customAreas = pgTable(
  "custom_areas",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    mode: customAreaModeEnum("mode").notNull(),
    lgaIds: integer("lga_ids").array(),
    polygonGeojson: jsonb("polygon_geojson"),
    geom: multiPolygon("geom"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_areas_org_idx").on(t.organizationId)],
);
