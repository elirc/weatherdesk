import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { env } from "@/lib/env";
import type {
  EmailAdapter,
  HistoryAdapter,
  LatLon,
  ObservedDay,
  PaymentsAdapter,
  SmsAdapter,
  StorageAdapter,
} from "../types";
import { syntheticObserved } from "./climate";

/** NASA POWER stand-in: same deterministic truth as mock forecast's recent days. */
export const mockHistoryAdapter: HistoryAdapter = {
  name: "mock",
  async fetchDaily(point: LatLon, startDate: string, endDate: string): Promise<ObservedDay[]> {
    const out: ObservedDay[] = [];
    const d = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (d <= end) {
      const date = d.toISOString().slice(0, 10);
      const s = syntheticObserved(point.lat, point.lon, date);
      out.push({
        date,
        rainMm: s.rainMm,
        tmaxC: s.tmaxC,
        tminC: s.tminC,
        humidityPct: s.humidityPct,
        windKmh: s.windKmh,
        solarMjM2: s.solarMjM2,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  },
};

/** Logs instead of sending. OTP codes are visible in dev logs via this path. */
export const mockSmsAdapter: SmsAdapter = {
  name: "mock",
  async send(msg) {
    console.log(`[mock-sms] ${msg.channel} -> ${msg.to}: ${msg.body}`);
    return { id: `mock-sms-${Date.now()}` };
  },
};

export const mockEmailAdapter: EmailAdapter = {
  name: "mock",
  async send(msg) {
    console.log(`[mock-email] -> ${msg.to}: ${msg.subject}`);
    return { id: `mock-email-${Date.now()}` };
  },
};

/** Always-succeeding checkout; signature check accepts the sha512 of body+secret. */
export const mockPaymentsAdapter: PaymentsAdapter = {
  name: "mock",
  async initializeTransaction(input) {
    return {
      authorizationUrl: `${env.APP_URL}/billing/mock-checkout?reference=${input.reference}`,
      reference: input.reference,
    };
  },
  async verifyTransaction(reference) {
    return {
      status: "success",
      amountKobo: 0,
      customerCode: `CUS_mock_${reference.slice(0, 8)}`,
      subscriptionCode: `SUB_mock_${reference.slice(0, 8)}`,
    };
  },
  verifyWebhookSignature(rawBody, signature) {
    const expected = createHash("sha512")
      .update(`${rawBody}mock-secret`)
      .digest("hex");
    return signature === expected;
  },
};

const storageRoot = () => path.resolve(env.STORAGE_LOCAL_DIR);

/** Local-disk storage doubles as the mock driver. */
export const localStorageAdapter: StorageAdapter = {
  name: "local",
  async put(key, content, contentType) {
    const file = path.join(storageRoot(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    await writeFile(`${file}.meta`, contentType, "utf8");
    return { key };
  },
  async get(key) {
    try {
      const file = path.join(storageRoot(), key);
      const [content, contentType] = await Promise.all([
        readFile(file),
        readFile(`${file}.meta`, "utf8").catch(() => "application/octet-stream"),
      ]);
      return { content, contentType };
    } catch {
      return null;
    }
  },
  async delete(key) {
    const file = path.join(storageRoot(), key);
    await rm(file, { force: true });
    await rm(`${file}.meta`, { force: true });
  },
};
