"use server";

import { actionError, requireEditor, type ActionResult } from "@/lib/authz";
import { writeAudit } from "@/lib/ops";
import { getAlertRule, updateAlertRule } from "@/server/queries/staff";
import { parseInput } from "../_lib/action-utils";
import { alertRuleUpdateSchema } from "../_lib/policy";

export async function updateAlertRuleAction(input: {
  id: string;
  type: string;
  threshold: number | string;
  severity: string;
  enabled: boolean;
  template: string;
}): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(alertRuleUpdateSchema, input);
    if (!p.ok) return p;
    const existing = await getAlertRule(p.data.id);
    if (!existing) return { ok: false, error: "Rule not found" };
    if (existing.type !== p.data.type) return { ok: false, error: "Rule type mismatch" };
    const next = {
      threshold: p.data.threshold,
      severity: p.data.severity,
      enabled: p.data.enabled,
      template: p.data.template,
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if (existing[k] !== next[k]) changes[k] = { from: existing[k], to: next[k] };
    }
    if (Object.keys(changes).length === 0) return { ok: false, error: "No changes to save" };
    await updateAlertRule(p.data.id, next, user.id);
    await writeAudit({
      actorUserId: user.id,
      action: "alert_rule.update",
      entity: "alert_rule",
      entityId: p.data.id,
      details: { type: existing.type, changes },
    });
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
