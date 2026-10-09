"use server";

import { z } from "zod";
import { actionError, requireAdmin, type ActionResult } from "@/lib/authz";
import { writeAudit } from "@/lib/ops";
import { sendJob, type JobName, type JobPayloads } from "@/lib/queue";
import { getJobRun } from "@/server/queries/staff";
import { parseInput } from "../../_lib/action-utils";
import { RUN_NOW, retryPlanFor } from "../../_lib/policy";

/** sendJob with a runtime-checked (name, payload) pair from the policy helpers. */
function sendUnchecked(name: JobName, data: object) {
  return sendJob(name, data as JobPayloads[typeof name]);
}

export async function retryJobAction(input: { runId: number }): Promise<ActionResult<{ jobId: string | null }>> {
  try {
    const user = await requireAdmin();
    const p = parseInput(z.object({ runId: z.number().int().positive() }), input);
    if (!p.ok) return p;
    const run = await getJobRun(p.data.runId);
    if (!run) return { ok: false, error: "Run not found" };
    if (run.status !== "failed") return { ok: false, error: "Only failed runs can be retried" };
    const plan = retryPlanFor(run);
    if (!plan.ok) return { ok: false, error: plan.reason };
    const jobId = await sendUnchecked(plan.name, plan.data);
    await writeAudit({
      actorUserId: user.id,
      action: "job.retry",
      entity: "job_run",
      entityId: String(run.id),
      details: { name: plan.name, data: plan.data, jobId },
    });
    return { ok: true, data: { jobId } };
  } catch (e) {
    return actionError(e);
  }
}

export async function triggerJobAction(input: { key: string }): Promise<ActionResult<{ jobId: string | null }>> {
  try {
    const user = await requireAdmin();
    const p = parseInput(z.object({ key: z.enum(RUN_NOW.map((r) => r.key) as [string, ...string[]]) }), input);
    if (!p.ok) return p;
    const job = RUN_NOW.find((r) => r.key === p.data.key)!;
    const jobId = await sendUnchecked(job.name, job.data);
    await writeAudit({
      actorUserId: user.id,
      action: "job.trigger",
      entity: "job",
      entityId: job.name,
      details: { name: job.name, data: job.data, jobId },
    });
    return { ok: true, data: { jobId } };
  } catch (e) {
    return actionError(e);
  }
}
