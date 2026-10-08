/**
 * Monthly provider-call budget guard (pure). The DB shell in
 * src/worker/budget.ts reads source_health and feeds it here.
 *
 * source_health.callsThisMonth is only meaningful for its monthKey
 * ('YYYY-MM', UTC — see src/lib/ops.ts). A row from a previous month means
 * zero calls so far this month.
 */

export type BudgetRow = { monthKey: string | null; callsThisMonth: number } | null | undefined;

export function monthKeyOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Calls already spent this month according to the row. */
export function callsSpent(row: BudgetRow, now: Date): number {
  if (!row || row.monthKey !== monthKeyOf(now)) return 0;
  return row.callsThisMonth;
}

/**
 * True when the source has reached the monthly budget and the call must be
 * skipped. `plannedCalls` lets callers refuse a batch that would overshoot.
 */
export function isOverBudget(row: BudgetRow, budget: number, now: Date, plannedCalls = 0): boolean {
  const spent = callsSpent(row, now);
  if (spent >= budget) return true;
  return plannedCalls > 0 && spent + plannedCalls > budget;
}
