/** Pure error classification helpers. */

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The report engine stubs throw "... not implemented yet (A5)" until A5 lands. */
export function isNotImplemented(e: unknown): boolean {
  return /not implemented/i.test(errorMessage(e));
}
