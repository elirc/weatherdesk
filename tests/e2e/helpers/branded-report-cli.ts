import "dotenv/config";
import { generateReportCore, renderReportPdfCore } from "@/reports/publish";
import { lagosToday } from "@/lib/time";
import { previousWeekStart } from "@/worker/core/periods";

/**
 * e2e helper: generate + render a branded custom-area report INLINE with the
 * engine (same calls the seed step uses), instead of queueing a
 * report.generate job and racing whatever worker process grabs it.
 *
 *   node node_modules/tsx/dist/cli.mjs tests/e2e/helpers/branded-report-cli.ts <customAreaId> <orgId>
 *
 * Prints one JSON line: { id, organizationId, pdfKey, bytes }.
 */
async function main() {
  const [areaId, orgId] = process.argv.slice(2);
  if (!areaId || !orgId) throw new Error("usage: branded-report-cli <customAreaId> <orgId>");
  const r = await generateReportCore({
    type: "weekly",
    scopeKey: `area:${areaId}`,
    periodStart: previousWeekStart(lagosToday()),
    phase: "final",
    organizationId: orgId,
  });
  const pdf = await renderReportPdfCore(r.id, { notify: false });
  process.stdout.write(`${JSON.stringify({ id: r.id, organizationId: orgId, pdfKey: pdf.key, bytes: pdf.bytes })}\n`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
