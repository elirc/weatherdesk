/**
 * pg-boss job contracts — the single registry of queue names, payload types
 * and schedules. The worker (src/worker) registers handlers for these; the
 * web app only ever SENDS jobs via sendJob(). Provider calls happen only
 * inside worker jobs (throttled, retried) — never in a request path.
 */

export const JOBS = {
  /** every 6 hours: refresh forecast for all active grid cells */
  forecastRefresh: "forecast.refresh",
  /** fan-out unit: fetch forecast for a chunk of cells */
  forecastFetchChunk: "forecast.fetch-chunk",
  /** daily 01:30 Lagos: archive snapshot, preliminary observed, NASA top-up, alerts, accuracy */
  dailyPipeline: "daily.pipeline",
  /** NASA POWER backfill for one cell (throttled fan-out) */
  historyBackfillCell: "history.backfill-cell",
  /** compute normals for one cell after backfill */
  normalsComputeCell: "normals.compute-cell",
  /** on-demand cell activation (user viewed an uncovered point) */
  cellActivate: "cell.activate",
  /** weekly Monday 05:00 Lagos: generate all weekly reports */
  reportsWeekly: "reports.weekly",
  /** monthly on the 2nd (preliminary) and 10th (final) */
  reportsMonthly: "reports.monthly",
  /** generate one report (fan-out unit) */
  reportGenerate: "report.generate",
  /** render + store the PDF for a report */
  reportRenderPdf: "report.render-pdf",
  /** send one notification (email/sms/whatsapp) */
  notificationSend: "notification.send",
  /** daily forecast SMS/WhatsApp sends due this quarter-hour */
  dailySendTick: "daily-send.tick",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export type JobPayloads = {
  [JOBS.forecastRefresh]: Record<string, never>;
  [JOBS.forecastFetchChunk]: { gridCellIds: number[] };
  [JOBS.dailyPipeline]: { date?: string };
  [JOBS.historyBackfillCell]: { gridCellId: number; startDate: string; endDate: string };
  [JOBS.normalsComputeCell]: { gridCellId: number };
  [JOBS.cellActivate]: { lat: number; lon: number };
  [JOBS.reportsWeekly]: { periodStart?: string };
  [JOBS.reportsMonthly]: { month?: string; phase: "preliminary" | "final" };
  [JOBS.reportGenerate]: {
    type: "weekly" | "monthly";
    scopeKey: string;
    periodStart: string;
    phase?: "preliminary" | "final";
    organizationId?: string;
  };
  [JOBS.reportRenderPdf]: { reportId: string };
  [JOBS.notificationSend]: { notificationId: string };
  [JOBS.dailySendTick]: Record<string, never>;
};

/**
 * Cron schedules (pg-boss uses UTC; Lagos is UTC+1).
 * Weekly reports: Monday 05:00 Lagos = 04:00 UTC. Publish at 6 — generation runs earlier.
 * Monthly: 2nd and 10th at 05:00 Lagos.
 */
export const SCHEDULES: { name: JobName; cron: string; data?: object }[] = [
  { name: JOBS.forecastRefresh, cron: "15 0,6,12,18 * * *" },
  { name: JOBS.dailyPipeline, cron: "30 0 * * *" }, // 01:30 Lagos
  { name: JOBS.reportsWeekly, cron: "0 4 * * 1" }, // Mon 05:00 Lagos
  { name: JOBS.reportsMonthly, cron: "0 4 2 * *", data: { phase: "preliminary" } },
  { name: JOBS.reportsMonthly, cron: "0 4 10 * *", data: { phase: "final" } },
  { name: JOBS.dailySendTick, cron: "*/15 * * * *" },
];

import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

const globalForBoss = globalThis as unknown as { __wdBoss?: PgBoss; __wdBossStarted?: Promise<PgBoss> };

/** Shared pg-boss instance (web sends; worker also registers handlers). */
export function getBoss(): PgBoss {
  if (!globalForBoss.__wdBoss) {
    globalForBoss.__wdBoss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
    });
  }
  return globalForBoss.__wdBoss;
}

export async function startedBoss(): Promise<PgBoss> {
  if (!globalForBoss.__wdBossStarted) {
    globalForBoss.__wdBossStarted = getBoss().start();
  }
  return globalForBoss.__wdBossStarted;
}

/** Typed job send. Queues are created by the worker at boot. */
export async function sendJob<N extends JobName>(
  name: N,
  data: JobPayloads[N],
  options?: object,
): Promise<string | null> {
  const boss = await startedBoss();
  return boss.send(name, data as object, options ?? {});
}
