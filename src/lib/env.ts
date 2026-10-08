import { z } from "zod";

/**
 * Server-only, Zod-validated environment. Import nothing from here in client components.
 * Throws at startup on invalid config — including the hard safety rule:
 * production + AUTH_MOCK is refused.
 */

const modeSchema = z.enum(["mock", "real"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),

  WD_MODE: modeSchema.default("mock"),
  AUTH_MOCK: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  FORECAST_PROVIDER: z.enum(["open-meteo", "google"]).default("open-meteo"),
  OPEN_METEO_API_KEY: z.string().optional(),
  GOOGLE_WEATHER_API_KEY: z.string().optional(),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("WeatherDesk"),
  /** account-specific base URL; default is Termii's NG endpoint */
  TERMII_BASE_URL: z.string().url().default("https://api.ng.termii.com"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("reports@weatherdesk.example"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),

  ADAPTER_FORECAST: modeSchema.optional(),
  ADAPTER_HISTORY: modeSchema.optional(),
  ADAPTER_SMS: modeSchema.optional(),
  ADAPTER_EMAIL: modeSchema.optional(),
  ADAPTER_PAYMENTS: modeSchema.optional(),
  ADAPTER_STORAGE: modeSchema.optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("weatherdesk"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  PROVIDER_CALL_BUDGET_MONTHLY: z.coerce.number().int().positive().default(1_000_000),
});

function load() {
  // dotenv turns `KEY=` lines into empty strings; treat those as unset so
  // optional enums/urls don't reject them.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    cleaned[k] = v === "" ? undefined : v;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.AUTH_MOCK) {
    throw new Error(
      "Refusing to start: AUTH_MOCK is enabled in production. Unset AUTH_MOCK.",
    );
  }
  return env;
}

export const env = load();

export type AdapterName = "forecast" | "history" | "sms" | "email" | "payments" | "storage";

/** Per-adapter mode: explicit override, else global WD_MODE. */
export function adapterMode(name: AdapterName): "mock" | "real" {
  const overrides: Record<AdapterName, "mock" | "real" | undefined> = {
    forecast: env.ADAPTER_FORECAST,
    history: env.ADAPTER_HISTORY,
    sms: env.ADAPTER_SMS,
    email: env.ADAPTER_EMAIL,
    payments: env.ADAPTER_PAYMENTS,
    storage: env.ADAPTER_STORAGE,
  };
  return overrides[name] ?? env.WD_MODE;
}
