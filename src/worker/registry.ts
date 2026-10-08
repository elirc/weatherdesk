import type { Queue } from "pg-boss";
import { JOBS, type JobName, type JobPayloads } from "@/lib/queue";
import { cellActivate } from "./jobs/cell";
import { dailyPipeline } from "./jobs/daily";
import { dailySendTick } from "./jobs/daily-send";
import { forecastFetchChunk, forecastRefresh, PROVIDER_RETRY } from "./jobs/forecast";
import { historyBackfillCell, normalsComputeCell } from "./jobs/history";
import { notificationSend } from "./jobs/notifications";
import { reportGenerate, reportRenderPdf, reportsMonthly, reportsWeekly } from "./jobs/reports";

/**
 * Handler + queue configuration for every JOBS name. Queue-level options are
 * the defaults for jobs sent without their own (retry/backoff/expiry).
 */

type QueueConfig = Omit<Queue, "name">;
type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<unknown>;

export type Registration<N extends JobName = JobName> = {
  name: N;
  handler: Handler<N>;
  queue: QueueConfig;
  /** worker-local concurrency (low-RAM box: keep small) */
  concurrency?: number;
};

const H = 3600;

function reg<N extends JobName>(name: N, handler: Handler<N>, queue: QueueConfig, concurrency?: number): Registration {
  return { name, handler, queue, concurrency } as unknown as Registration;
}

export const REGISTRATIONS: Registration[] = [
  reg(JOBS.forecastRefresh, () => forecastRefresh(), { retryLimit: 1, retryDelay: 120, expireInSeconds: 600 }),
  // stately + per-chunk singletonKey: at most one queued and one active job per chunk (no pile-up)
  reg(JOBS.forecastFetchChunk, forecastFetchChunk, { policy: "stately", ...PROVIDER_RETRY, expireInSeconds: 600 }, 2),
  reg(JOBS.dailyPipeline, dailyPipeline, { retryLimit: 1, retryDelay: 900, expireInSeconds: 4 * H }),
  reg(JOBS.historyBackfillCell, historyBackfillCell, { ...PROVIDER_RETRY, expireInSeconds: H }),
  reg(JOBS.normalsComputeCell, normalsComputeCell, { retryLimit: 2, retryDelay: 60, expireInSeconds: 900 }),
  reg(JOBS.cellActivate, cellActivate, { ...PROVIDER_RETRY, expireInSeconds: 600 }, 2),
  reg(JOBS.reportsWeekly, reportsWeekly, { retryLimit: 1, retryDelay: 300, expireInSeconds: 900 }),
  reg(JOBS.reportsMonthly, reportsMonthly, { retryLimit: 1, retryDelay: 300, expireInSeconds: 900 }),
  reg(JOBS.reportGenerate, reportGenerate, { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 }),
  reg(JOBS.reportRenderPdf, reportRenderPdf, { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 }),
  reg(JOBS.notificationSend, notificationSend, { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 300 }, 2),
  reg(JOBS.dailySendTick, () => dailySendTick(), { retryLimit: 0, expireInSeconds: 600 }),
];
