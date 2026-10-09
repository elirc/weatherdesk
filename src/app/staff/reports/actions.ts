"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { actionError, requireEditor, type ActionResult } from "@/lib/authz";
import { writeAudit } from "@/lib/ops";
import { JOBS, sendJob } from "@/lib/queue";
import {
  getReportCore,
  setReportPublished,
  updateReportCorrection,
  updateReportNarrative,
} from "@/server/queries/staff";
import { parseInput } from "../_lib/action-utils";
import { regeneratePayload, statusOnPublish } from "../_lib/policy";

const idSchema = z.string().min(1).max(64);

/** Public report page + map route are cached under these tags (A4). */
function refreshPublic(id: string) {
  updateTag(`report:${id}`);
  updateTag("reports");
}

export async function saveNarrativeAction(input: { id: string; narrative: string }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema, narrative: z.string().trim().min(20, "Narrative is too short").max(20_000) }), input);
    if (!p.ok) return p;
    const res = await updateReportNarrative(p.data.id, p.data.narrative);
    if (!res) return { ok: false, error: "Report not found" };
    await writeAudit({
      actorUserId: user.id,
      action: "report.narrative.edit",
      entity: "report",
      entityId: p.data.id,
      details: { previousLength: res.previousLength, newLength: p.data.narrative.length },
    });
    refreshPublic(p.data.id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function saveCorrectionAction(input: { id: string; correctionNote: string }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema, correctionNote: z.string().trim().max(2000) }), input);
    if (!p.ok) return p;
    const note = p.data.correctionNote || null;
    if (!(await updateReportCorrection(p.data.id, note))) return { ok: false, error: "Report not found" };
    await writeAudit({
      actorUserId: user.id,
      action: "report.correct",
      entity: "report",
      entityId: p.data.id,
      details: { correctionNote: note },
    });
    refreshPublic(p.data.id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function publishReportAction(input: { id: string; promoteToFinal: boolean }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema, promoteToFinal: z.boolean() }), input);
    if (!p.ok) return p;
    const r = await getReportCore(p.data.id);
    if (!r) return { ok: false, error: "Report not found" };
    const status = statusOnPublish(r.type, r.status, p.data.promoteToFinal);
    const already = r.publishedAt != null && status === r.status;
    if (already) return { ok: false, error: "Report is already published" };
    await setReportPublished(r.id, { publishedAt: r.publishedAt ?? new Date(), status });
    await writeAudit({
      actorUserId: user.id,
      action: "report.publish",
      entity: "report",
      entityId: r.id,
      details: { fromStatus: r.status, toStatus: status, wasPublished: r.publishedAt != null },
    });
    refreshPublic(r.id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function unpublishReportAction(input: { id: string }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema }), input);
    if (!p.ok) return p;
    const r = await getReportCore(p.data.id);
    if (!r) return { ok: false, error: "Report not found" };
    if (!r.publishedAt) return { ok: false, error: "Report is not published" };
    await setReportPublished(r.id, { publishedAt: null });
    await writeAudit({
      actorUserId: user.id,
      action: "report.unpublish",
      entity: "report",
      entityId: r.id,
      details: { previousPublishedAt: r.publishedAt.toISOString(), status: r.status },
    });
    refreshPublic(r.id);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function regenerateReportAction(input: { id: string }): Promise<ActionResult<{ jobId: string | null }>> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema }), input);
    if (!p.ok) return p;
    const r = await getReportCore(p.data.id);
    if (!r) return { ok: false, error: "Report not found" };
    const payload = regeneratePayload(r);
    const jobId = await sendJob(JOBS.reportGenerate, payload, { singletonKey: `regen:${r.id}`, retryLimit: 1 });
    await writeAudit({
      actorUserId: user.id,
      action: "report.regenerate",
      entity: "report",
      entityId: r.id,
      details: { job: JOBS.reportGenerate, payload, jobId },
    });
    return { ok: true, data: { jobId } };
  } catch (e) {
    return actionError(e);
  }
}

export async function rerenderPdfAction(input: { id: string }): Promise<ActionResult<{ jobId: string | null }>> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: idSchema }), input);
    if (!p.ok) return p;
    const r = await getReportCore(p.data.id);
    if (!r) return { ok: false, error: "Report not found" };
    // Safe to repeat: renderReportPdf notifies subscribers once per report (A5).
    const jobId = await sendJob(JOBS.reportRenderPdf, { reportId: r.id }, { singletonKey: `pdf:${r.id}`, retryLimit: 2 });
    await writeAudit({
      actorUserId: user.id,
      action: "report.render_pdf",
      entity: "report",
      entityId: r.id,
      details: { job: JOBS.reportRenderPdf, jobId },
    });
    return { ok: true, data: { jobId } };
  } catch (e) {
    return actionError(e);
  }
}
