import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { gridCells } from "./geo";

/** Latest forecast run only (upserted). Hourly, 16 days ahead. */
export const forecastHourly = pgTable(
  "forecast_hourly",
  {
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    validTime: timestamp("valid_time", { withTimezone: true }).notNull(),
    temperatureC: real("temperature_c"),
    feelsLikeC: real("feels_like_c"),
    humidityPct: real("humidity_pct"),
    rainMm: real("rain_mm"),
    rainProbPct: real("rain_prob_pct"),
    windSpeedKmh: real("wind_speed_kmh"),
    windGustsKmh: real("wind_gusts_kmh"),
    windDirectionDeg: real("wind_direction_deg"),
    cloudCoverPct: real("cloud_cover_pct"),
    weatherCode: smallint("weather_code"),
    uvIndex: real("uv_index"),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gridCellId, t.validTime] }),
    index("forecast_hourly_valid_idx").on(t.validTime),
  ],
);

/** Latest forecast run only (upserted). Daily, 16 days ahead. Dates are Africa/Lagos civil dates. */
export const forecastDaily = pgTable(
  "forecast_daily",
  {
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    date: date("date").notNull(),
    tmaxC: real("tmax_c"),
    tminC: real("tmin_c"),
    rainMm: real("rain_mm"),
    rainProbPct: real("rain_prob_pct"),
    windMaxKmh: real("wind_max_kmh"),
    gustsMaxKmh: real("gusts_max_kmh"),
    uvIndexMax: real("uv_index_max"),
    weatherCode: smallint("weather_code"),
    sunrise: timestamp("sunrise", { withTimezone: true }),
    sunset: timestamp("sunset", { withTimezone: true }),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.gridCellId, t.date] })],
);

/** Daily snapshot of selected lead days, for accuracy measurement. */
export const forecastArchive = pgTable(
  "forecast_archive",
  {
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    issueDate: date("issue_date").notNull(),
    targetDate: date("target_date").notNull(),
    leadDays: smallint("lead_days").notNull(),
    rainMm: real("rain_mm"),
    rainProbPct: real("rain_prob_pct"),
    tmaxC: real("tmax_c"),
    tminC: real("tmin_c"),
  },
  (t) => [
    primaryKey({ columns: [t.gridCellId, t.issueDate, t.targetDate] }),
    index("forecast_archive_target_idx").on(t.targetDate),
  ],
);

/** Observed daily values. NASA POWER (final) replaces model estimates (preliminary). */
export const observedDaily = pgTable(
  "observed_daily",
  {
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    date: date("date").notNull(),
    rainMm: real("rain_mm"),
    tmaxC: real("tmax_c"),
    tminC: real("tmin_c"),
    humidityPct: real("humidity_pct"),
    windKmh: real("wind_kmh"),
    solarMjM2: real("solar_mj_m2"),
    /** 'nasa_power' | 'model_estimate' */
    source: text("source").notNull(),
    preliminary: boolean("preliminary").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gridCellId, t.date] }),
    index("observed_daily_date_idx").on(t.date),
  ],
);

/** 1991–2020 monthly climate normals per grid cell. */
export const normalsMonthly = pgTable(
  "normals_monthly",
  {
    gridCellId: integer("grid_cell_id")
      .notNull()
      .references(() => gridCells.id),
    month: smallint("month").notNull(),
    rainMm: real("rain_mm"),
    rainyDays: real("rainy_days"),
    tmaxC: real("tmax_c"),
    tminC: real("tmin_c"),
  },
  (t) => [primaryKey({ columns: [t.gridCellId, t.month] })],
);

/** Median rainy-season onset/cessation day-of-year per grid cell. */
export const normalsSeason = pgTable("normals_season", {
  gridCellId: integer("grid_cell_id")
    .primaryKey()
    .references(() => gridCells.id),
  onsetDoy: smallint("onset_doy"),
  cessationDoy: smallint("cessation_doy"),
  seasonLengthDays: smallint("season_length_days"),
  method: text("method").notNull().default("agro_onset_v1"),
});
