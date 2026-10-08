/**
 * Report engine entry points — INTERFACE CONTRACT.
 * The reports agent (A5) replaces the bodies; the signatures are frozen so the
 * worker (A2) and seed steps can compile against them from day one.
 */

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
export async function generateReport(_input: GenerateReportInput): Promise<string> {
  void _input;
  throw new Error("reports engine not implemented yet (A5)");
}

/** Render and store the PDF for an existing report; sets reports.pdf_key. */
export async function renderReportPdf(_reportId: string): Promise<void> {
  void _reportId;
  throw new Error("reports engine not implemented yet (A5)");
}

/** All scopeKeys a scheduled run must cover: national + every state + every active custom area. */
export async function listReportScopes(): Promise<string[]> {
  throw new Error("reports engine not implemented yet (A5)");
}
