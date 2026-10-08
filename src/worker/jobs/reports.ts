import { generateReport, listReportScopes, renderReportPdf } from "@/reports/generate";
import { JOBS, sendJob, type JobPayloads } from "@/lib/queue";
import { lagosToday } from "@/lib/time";
import { normaliseMonth, previousMonthStart, previousWeekStart } from "../core/periods";
import { isNotImplemented } from "../core/errors";
import { errMessage, log } from "../log";

/**
 * Report jobs. The report engine (src/reports/generate.ts, agent A5) throws
 * "not implemented" until it lands — that is caught and logged as a warning
 * so the worker stays healthy and job_runs records 'ok'.
 */

async function guarded<T>(what: string, fn: () => Promise<T>): Promise<T | { skipped: "not_implemented" }> {
  try {
    return await fn();
  } catch (e) {
    if (isNotImplemented(e)) {
      log.warn(`${what}: report engine not implemented yet — skipped`, { error: errMessage(e) });
      return { skipped: "not_implemented" };
    }
    throw e;
  }
}

const REPORT_RETRY = { retryLimit: 2, retryDelay: 60, retryBackoff: true } as const;

/** reports.weekly — previous full Mon–Sun week (Lagos) for every scope. */
export async function reportsWeekly(data: { periodStart?: string }) {
  const periodStart = data.periodStart ?? previousWeekStart(lagosToday());
  return guarded("reports.weekly", async () => {
    const scopes = await listReportScopes();
    for (const scopeKey of scopes) {
      await sendJob(
        JOBS.reportGenerate,
        { type: "weekly", scopeKey, periodStart },
        { ...REPORT_RETRY, singletonKey: `weekly:${scopeKey}:${periodStart}` },
      );
    }
    log.info("reports.weekly queued", { periodStart, scopes: scopes.length });
    return { periodStart, scopes: scopes.length };
  });
}

/** reports.monthly — previous calendar month (Lagos), preliminary on the 2nd, final on the 10th. */
export async function reportsMonthly(data: { month?: string; phase: "preliminary" | "final" }) {
  const periodStart = data.month ? normaliseMonth(data.month) : previousMonthStart(lagosToday());
  const phase = data.phase ?? "preliminary";
  return guarded("reports.monthly", async () => {
    const scopes = await listReportScopes();
    for (const scopeKey of scopes) {
      await sendJob(
        JOBS.reportGenerate,
        { type: "monthly", scopeKey, periodStart, phase },
        { ...REPORT_RETRY, singletonKey: `monthly:${phase}:${scopeKey}:${periodStart}` },
      );
    }
    log.info("reports.monthly queued", { periodStart, phase, scopes: scopes.length });
    return { periodStart, phase, scopes: scopes.length };
  });
}

/** report.generate — one report (generateReport itself queues PDF rendering). */
export async function reportGenerate(data: JobPayloads[typeof JOBS.reportGenerate]) {
  return guarded("report.generate", async () => ({ reportId: await generateReport(data) }));
}

/** report.render-pdf */
export async function reportRenderPdf(data: { reportId: string }) {
  return guarded("report.render-pdf", async () => {
    await renderReportPdf(data.reportId);
    return { reportId: data.reportId };
  });
}
