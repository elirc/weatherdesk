/**
 * Imported right after `dotenv/config` and before anything that touches
 * src/lib/env.ts. `.env.example` ships empty overrides like `ADAPTER_SMS=`,
 * which dotenv sets to "" — and env.ts's `z.enum([...]).optional()` rejects
 * "" (only undefined is optional), crashing startup. Treat empty values as
 * unset. (Contract friction reported to the orchestrator; env.ts is frozen.)
 */
for (const [k, v] of Object.entries(process.env)) {
  if (v === "") delete process.env[k];
}

export {};
