import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceHealth } from "@/db/schema";
import { env } from "@/lib/env";
import { callsSpent, isOverBudget } from "./core/budget";
import { log } from "./log";

/**
 * Monthly budget guard (DB shell). Mock adapters make no provider calls and
 * are never guarded. Returns false (and logs a warning) when the call must be
 * skipped; pages keep showing the last good data with its age.
 */
export async function budgetAllows(source: string, plannedCalls = 0, what = "provider call"): Promise<boolean> {
  if (source === "mock") return true;
  const [row] = await db
    .select({ monthKey: sourceHealth.monthKey, callsThisMonth: sourceHealth.callsThisMonth })
    .from(sourceHealth)
    .where(eq(sourceHealth.source, source))
    .limit(1);
  const now = new Date();
  if (isOverBudget(row, env.PROVIDER_CALL_BUDGET_MONTHLY, now, plannedCalls)) {
    log.warn(`budget guard: skipping ${what}`, {
      source,
      callsThisMonth: callsSpent(row, now),
      budget: env.PROVIDER_CALL_BUDGET_MONTHLY,
      plannedCalls,
    });
    return false;
  }
  return true;
}
