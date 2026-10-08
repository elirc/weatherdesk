import "dotenv/config";
import "./preload-env";
import { getBoss, JOBS, SCHEDULES, startedBoss } from "@/lib/queue";
import { recordJobRun } from "@/lib/ops";
import { pool } from "@/db";
import { adapterMode, env } from "@/lib/env";
import { errMessage, log } from "./log";
import { REGISTRATIONS } from "./registry";

/**
 * WeatherDesk worker: pg-boss queues, cron schedules and job handlers.
 * Run: `pnpm worker` (or `pnpm worker:dev` with watch).
 * Every handler is wrapped in recordJobRun (job_runs) and logs lifecycle;
 * a failing job never takes the process down — pg-boss records the failure
 * and retries per queue policy.
 */

let stopping = false;

async function main() {
  log.info("starting", {
    mode: env.WD_MODE,
    adapters: {
      forecast: adapterMode("forecast"),
      history: adapterMode("history"),
      sms: adapterMode("sms"),
      email: adapterMode("email"),
    },
    budget: env.PROVIDER_CALL_BUDGET_MONTHLY,
  });

  const boss = getBoss();
  boss.on("error", (e) => log.error("pg-boss error", { error: errMessage(e) }));
  await startedBoss();
  log.info("pg-boss started (schema pgboss)");

  for (const r of REGISTRATIONS) {
    await boss.createQueue(r.name, r.queue);
  }
  log.info(`queues ensured: ${REGISTRATIONS.length}`);

  // Multiple schedules may share a queue (reports.monthly on the 2nd and 10th) — key them by cron.
  for (const s of SCHEDULES) {
    await boss.schedule(s.name, s.cron, s.data ?? {}, { tz: "UTC", key: s.cron.replace(/[^\w]+/g, "_") });
  }
  log.info(`schedules registered: ${SCHEDULES.length}`);

  for (const r of REGISTRATIONS) {
    await boss.work<object>(r.name, { batchSize: 1, localConcurrency: r.concurrency ?? 1 }, async (jobs) => {
      for (const job of jobs) {
        const t0 = Date.now();
        log.info(`job start ${r.name}`, { id: job.id, retry: job.retryCount });
        try {
          const out = await recordJobRun(r.name, () => (r.handler as (d: object) => Promise<unknown>)(job.data ?? {}), {
            jobId: job.id,
            data: job.data,
          });
          log.info(`job ok ${r.name}`, { id: job.id, ms: Date.now() - t0 });
          return out;
        } catch (e) {
          log.error(`job failed ${r.name}`, { id: job.id, ms: Date.now() - t0, error: errMessage(e) });
          throw e;
        }
      }
    });
  }
  log.info(`handlers registered: ${REGISTRATIONS.length}`, { jobs: Object.values(JOBS) });
  log.info("worker ready");
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info(`received ${signal}, stopping gracefully`);
  try {
    await getBoss().stop({ graceful: true, timeout: 20_000 });
  } catch (e) {
    log.error("error stopping pg-boss", { error: errMessage(e) });
  }
  try {
    await pool.end();
  } catch {
    /* already closed */
  }
  log.info("stopped");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => log.error("unhandledRejection", { error: errMessage(e) }));
process.on("uncaughtException", (e) => log.error("uncaughtException", { error: errMessage(e) }));

main().catch((e) => {
  log.error("worker failed to start", { error: errMessage(e) });
  process.exit(1);
});
