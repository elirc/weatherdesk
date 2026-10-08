/**
 * Plain-fetch helper for real drivers: timeout, JSON parse, and error
 * messages that never include secrets (callers pass a redacted label).
 */

export class ProviderHttpError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 30_000, label, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderHttpError(
      provider,
      res.status,
      `${provider} HTTP ${res.status} ${label ?? ""}: ${text.slice(0, 300)}`.replace(/\s+/g, " ").trim(),
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderHttpError(provider, res.status, `${provider}: invalid JSON response ${label ?? ""}`.trim());
  }
}

/**
 * withSourceHealth(source, fn, calls) from src/lib/ops, imported lazily so
 * merely importing the adapter registry never opens a DB pool.
 */
export async function tracked<T>(source: string, fn: () => Promise<T>, calls = 1): Promise<T> {
  const { withSourceHealth } = await import("@/lib/ops");
  return withSourceHealth(source, fn, calls);
}

export const sleep =(ms: number) => new Promise<void>((r) => setTimeout(r, ms));
