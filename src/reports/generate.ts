/**
 * Report engine entry points — INTERFACE CONTRACT.
 * The reports agent (A5) replaces the bodies; the signatures are frozen so the
 * worker (A2) and seed steps can compile against them from day one.
 */

import { JOBS, sendJob } from "@/lib/queue";
import { generateReportCore, listReportScopesCore, renderReportPdfCore } from "./publish";

export type ReportPhase = "preliminary" | "final";

export type GenerateReportInput = {
  type: "weekly" | "monthly";
  /** 'national' | 'state:<stateId>' | 'area:<customAreaId>' */
  scopeKey: string;
  /** Monday for weekly, first of month for monthly (YYYY-MM-DD) */
  periodStart: string;
  phase?: ReportPhase;
  /** when set, produce the branded copy for this organisation */
  organizationId?: string;
};

/**
 * Compute content, fill narrative templates, upsert the reports row and
 * queue PDF rendering. Returns the report id.
 */
export async function generateReport(input: GenerateReportInput): Promise<string> {
  const { id } = await generateReportCore(input);
  await sendJob(JOBS.reportRenderPdf, { reportId: id }, { retryLimit: 2, retryDelay: 60, retryBackoff: true, singletonKey: `pdf:${id}` });
  return id;
}

/**
 * Render and store the PDF for an existing report; sets reports.pdf_key.
 * For national public reports this also notifies report subscribers (once).
 */
export async function renderReportPdf(reportId: string): Promise<void> {
  await renderReportPdfCore(reportId, { notify: true });
}

/** All scopeKeys a scheduled run must cover: national + every state + every active custom area. */
export async function listReportScopes(): Promise<string[]> {
  return listReportScopesCore();
}
