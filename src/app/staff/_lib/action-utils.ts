import "server-only";
import type { z } from "zod";

/** safeParse → first issue message (friendlier than a generic "Invalid input"). */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: issue?.message ?? "Invalid input" };
}
