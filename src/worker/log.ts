/** Minimal structured logger for the worker process (stdout/stderr, one line per event). */

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, extra?: object) {
  const line = `${new Date().toISOString()} [worker] ${level.toUpperCase()} ${msg}${extra ? ` ${safeJson(extra)}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function safeJson(o: object): string {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}

export const log = {
  info: (msg: string, extra?: object) => emit("info", msg, extra),
  warn: (msg: string, extra?: object) => emit("warn", msg, extra),
  error: (msg: string, extra?: object) => emit("error", msg, extra),
};

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
