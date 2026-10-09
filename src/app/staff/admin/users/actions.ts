"use server";

import { z } from "zod";
import { actionError, requireAdmin, type ActionResult } from "@/lib/authz";
import { writeAudit } from "@/lib/ops";
import { getUserRole, setUserRole } from "@/server/queries/staff";
import { parseInput } from "../../_lib/action-utils";
import { ROLES, checkRoleChange } from "../../_lib/policy";

export async function setUserRoleAction(input: { userId: string; role: string }): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const p = parseInput(z.object({ userId: z.string().min(1).max(64), role: z.enum(ROLES) }), input);
    if (!p.ok) return p;
    const target = await getUserRole(p.data.userId);
    if (!target) return { ok: false, error: "User not found" };
    const check = checkRoleChange({ actorId: actor.id, targetId: target.id, currentRole: target.role, newRole: p.data.role });
    if (!check.ok) return check;
    await setUserRole(target.id, p.data.role);
    await writeAudit({
      actorUserId: actor.id,
      action: "user.role",
      entity: "user",
      entityId: target.id,
      details: { email: target.email, from: target.role, to: p.data.role },
    });
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
