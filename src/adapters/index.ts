import { adapterMode, env } from "@/lib/env";
import type {
  EmailAdapter,
  ForecastAdapter,
  HistoryAdapter,
  PaymentsAdapter,
  SmsAdapter,
  StorageAdapter,
} from "./types";
import { mockForecastAdapter } from "./mock/forecast";
import {
  localStorageAdapter,
  mockEmailAdapter,
  mockHistoryAdapter,
  mockPaymentsAdapter,
  mockSmsAdapter,
} from "./mock/misc";
import { openMeteoAdapter } from "./real/open-meteo";
import { googleWeatherAdapter } from "./real/google-weather";
import { nasaPowerAdapter } from "./real/nasa-power";
import { termiiAdapter } from "./real/termii";
import { resendAdapter } from "./real/resend";
import { paystackAdapter } from "./real/paystack";
import { s3StorageAdapter } from "./real/s3";

/**
 * Adapter registry: mock or real driver per adapter, chosen by env
 * (WD_MODE global, ADAPTER_* overrides). In mock mode no network call is
 * ever made — mock drivers are deterministic fixtures.
 */

export function getForecastAdapter(): ForecastAdapter {
  if (adapterMode("forecast") === "mock") return mockForecastAdapter;
  return env.FORECAST_PROVIDER === "google" ? googleWeatherAdapter : openMeteoAdapter;
}

export function getHistoryAdapter(): HistoryAdapter {
  return adapterMode("history") === "mock" ? mockHistoryAdapter : nasaPowerAdapter;
}

export function getSmsAdapter(): SmsAdapter {
  return adapterMode("sms") === "mock" ? mockSmsAdapter : termiiAdapter;
}

export function getEmailAdapter(): EmailAdapter {
  return adapterMode("email") === "mock" ? mockEmailAdapter : resendAdapter;
}

export function getPaymentsAdapter(): PaymentsAdapter {
  return adapterMode("payments") === "mock" ? mockPaymentsAdapter : paystackAdapter;
}

export function getStorageAdapter(): StorageAdapter {
  if (env.STORAGE_DRIVER === "local" || adapterMode("storage") === "mock") {
    return localStorageAdapter;
  }
  return s3StorageAdapter;
}
