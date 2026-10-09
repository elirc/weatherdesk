import { generateReportCore, renderReportPdfCore } from "@/reports/publish";
import { addDaysIso, lagosToday } from "@/lib/time";
import { previousMonthStart, previousWeekStart } from "@/worker/core/periods";
import type { SeedContext, SeedCounts, SeedStep } from "../lib/seed-types";

/**
 * Published sample reports: the last 4 complete Mon–Sun weeks (national
 * weekly, final) and the last complete month (national monthly, final),
 * each with its PDF in storage. Calls the engine directly — no queue, no
 * subscriber notifications. Idempotent: generation upserts by
 * (type, scopeKey, periodStart, organizationId) and the PDF is overwritten.
 */
async function run(ctx: SeedContext): Promise<SeedCounts> {
  const today = lagosToday();
  const lastWeek = previousWeekStart(today);
  const jobs = [
    ...[3, 2, 1, 0].map((i) => ({ type: "weekly" as const, periodStart: addDaysIso(lastWeek, -7 * i) })),
    { type: "monthly" as const, periodStart: previousMonthStart(today) },
  ];
  let weekly = 0;
  let monthly = 0;
  let pdfBytes = 0;
  let minPdf = Infinity;
  for (const j of jobs) {
    const t = Date.now();
    const r = await generateReportCore({ type: j.type, scopeKey: "national", periodStart: j.periodStart, phase: "final" });
    const pdf = await renderReportPdfCore(r.id, { notify: false });
    if (j.type === "weekly") weekly += 1;
    else monthly += 1;
    pdfBytes += pdf.bytes;
    minPdf = Math.min(minPdf, pdf.bytes);
    ctx.log(`${j.type} national ${j.periodStart}: ${r.created ? "created" : "updated"} ${r.status}, ${pdf.key} (${Math.round(pdf.bytes / 1024)} KB) in ${Date.now() - t} ms`);
  }
  return { weekly, monthly, pdfKB: Math.round(pdfBytes / 1024), minPdfKB: Math.round(minPdf / 1024) };
}

export const step: SeedStep = { name: "reports", run };
