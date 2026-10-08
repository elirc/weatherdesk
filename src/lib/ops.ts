import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, sourceHealth } from "@/db/schema";

/**
 * Operational plumbing shared by every worker job (CONVENTIONS: wrap handlers
 * in recordJobRun; call touchSourceHealth around provider calls).
 */

export async function recordJobRun<T>(
  name: string,
  fn: () => Promise<T>,
  details?: object,
): Promise<T> {
  const [run] = await db
    .insert(jobRuns)
    .values({ name, status: "running", details: details ?? null })
    .returning({ id: jobRuns.id });
  try {
    const result = await fn();
    await db
      .update(jobRuns)
      .set({ status: "ok", finishedAt: new Date() })
      .where(eq(jobRuns.id, run.id));
    return result;
  } catch (e) {
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? `${e.message}\n${e.stack ?? ""}`.slice(0, 4000) : String(e),
      })
      .where(eq(jobRuns.id, run.id));
    throw e;
  }
}

/** Upsert provider health after a successful call. */
export async function sourceSuccess(source: string, latencyMs: number, calls = 1): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7);
  await db
    .insert(sourceHealth)
    .values({
      source,
      lastSuccessAt: new Date(),
      latencyMs,
      consecutiveFailures: 0,
      monthKey,
      callsThisMonth: calls,
    })
    .onConflictDoUpdate({
      target: sourceHealth.source,
      set: {
        lastSuccessAt: new Date(),
        latencyMs,
        consecutiveFailures: 0,
        callsThisMonth: sql`CASE WHEN ${sourceHealth.monthKey} = ${monthKey} THEN ${sourceHealth.callsThisMonth} + ${calls} ELSE ${calls} END`,
        monthKey,
      },
    });
}

/** Upsert provider health after a failed call. */
export async function sourceFailure(source: string, error: string): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7);
  await db
    .insert(sourceHealth)
    .values({
      source,
      lastErrorAt: new Date(),
      lastError: error.slice(0, 2000),
      consecutiveFailures: 1,
      monthKey,
    })
    .onConflictDoUpdate({
      target: sourceHealth.source,
      set: {
        lastErrorAt: new Date(),
        lastError: error.slice(0, 2000),
        consecutiveFailures: sql`${sourceHealth.consecutiveFailures} + 1`,
      },
    });
}

/** Wrap a provider call with health + latency tracking. */
export async function withSourceHealth<T>(
  source: string,
  fn: () => Promise<T>,
  calls = 1,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await sourceSuccess(source, Date.now() - start, calls);
    return result;
  } catch (e) {
    await sourceFailure(source, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function writeAudit(input: {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: object;
}): Promise<void> {
  const { auditLog } = await import("@/db/schema");
  await db.insert(auditLog).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    details: input.details ?? null,
  });
}
