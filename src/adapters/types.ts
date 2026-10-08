/**
 * Provider adapter contracts. Each adapter has a mock driver (deterministic,
 * zero network) and a real driver, chosen by env via src/adapters/index.ts.
 * Real drivers: check current provider docs before coding — record the doc URL
 * in a comment at the top of the driver file.
 */

export type LatLon = { lat: number; lon: number };

export type HourlyPoint = {
  validTime: Date;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  windSpeedKmh: number | null;
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  cloudCoverPct: number | null;
  weatherCode: number | null;
  uvIndex: number | null;
};

export type DailyPoint = {
  /** Africa/Lagos civil date, YYYY-MM-DD */
  date: string;
  tmaxC: number | null;
  tminC: number | null;
  rainMm: number | null;
  rainProbPct: number | null;
  windMaxKmh: number | null;
  gustsMaxKmh: number | null;
  uvIndexMax: number | null;
  weatherCode: number | null;
  sunrise: Date | null;
  sunset: Date | null;
};

export type ForecastResult = {
  point: LatLon;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  source: string;
  fetchedAt: Date;
};

export type ObservedDay = {
  /** YYYY-MM-DD */
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  solarMjM2: number | null;
};

export interface ForecastAdapter {
  readonly name: string;
  /**
   * 16-day hourly+daily forecast for up to `maxPointsPerCall` coords.
   * Callers chunk accordingly; drivers must not exceed one provider request
   * per chunk where the provider supports multi-coordinate calls.
   */
  readonly maxPointsPerCall: number;
  fetchForecast(points: LatLon[]): Promise<ForecastResult[]>;
  /** Model-estimated recent daily values (used as preliminary observations). */
  fetchRecentDaily(points: LatLon[], days: number): Promise<
    { point: LatLon; days: ObservedDay[]; source: string; fetchedAt: Date }[]
  >;
}

export interface HistoryAdapter {
  readonly name: string;
  /** Inclusive range of final daily observations for one point. */
  fetchDaily(point: LatLon, startDate: string, endDate: string): Promise<ObservedDay[]>;
}

export type SmsMessage = {
  to: string; // E.164
  body: string;
  channel: "sms" | "whatsapp";
};

export interface SmsAdapter {
  readonly name: string;
  send(msg: SmsMessage): Promise<{ id: string }>;
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export interface EmailAdapter {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ id: string }>;
}

export interface PaymentsAdapter {
  readonly name: string;
  /** Hosted checkout for a subscription. amountKobo is integer kobo. */
  initializeTransaction(input: {
    email: string;
    amountKobo: number;
    planCode?: string;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; reference: string }>;
  verifyTransaction(reference: string): Promise<{
    status: "success" | "failed" | "pending";
    amountKobo: number;
    customerCode?: string;
    subscriptionCode?: string;
    planCode?: string;
  }>;
  /** HMAC verification of the raw webhook body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

export interface StorageAdapter {
  readonly name: string;
  put(key: string, content: Buffer, contentType: string): Promise<{ key: string }>;
  get(key: string): Promise<{ content: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
