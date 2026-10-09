"use server";

import { actionError, requireAdmin, type ActionResult } from "@/lib/authz";
import { nairaToKobo } from "@/lib/money";
import { writeAudit } from "@/lib/ops";
import { getPlan, updatePlan } from "@/server/queries/staff";
import { parseInput } from "../../_lib/action-utils";
import { mergePlanLimits, planUpdateSchema } from "../../_lib/policy";

export async function updatePlanAction(input: {
  id: string;
  priceNaira: number | string;
  apiCallsPerDay: number | string;
  customAreas: number | string;
  downloads: boolean;
  brandedReports: boolean;
  active: boolean;
}): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const p = parseInput(planUpdateSchema, input);
    if (!p.ok) return p;
    const plan = await getPlan(p.data.id);
    if (!plan) return { ok: false, error: "Plan not found" };
    const priceKoboMonthly = nairaToKobo(p.data.priceNaira);
    const limits = mergePlanLimits(plan.limits, {
      apiCallsPerDay: p.data.apiCallsPerDay,
      customAreas: p.data.customAreas,
      downloads: p.data.downloads,
      brandedReports: p.data.brandedReports,
    });
    await updatePlan(plan.id, { priceKoboMonthly, limits, active: p.data.active });
    await writeAudit({
      actorUserId: user.id,
      action: "plan.update",
      entity: "plan",
      entityId: plan.id,
      details: {
        before: { priceKoboMonthly: plan.priceKoboMonthly, limits: plan.limits, active: plan.active },
        after: { priceKoboMonthly, limits, active: p.data.active },
      },
    });
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
