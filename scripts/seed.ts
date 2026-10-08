import "dotenv/config";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SeedContext, SeedCounts, SeedStep } from "./lib/seed-types";

/**
 * WeatherDesk seed runner: `pnpm seed` (= tsx scripts/seed.ts).
 *
 * Runs every `scripts/seed-steps/NN-name.ts` in numeric order. Steps are
 * idempotent, so re-running is safe. Options:
 *   --only=10,20     run just these step numbers
 *   --skip=60        skip these step numbers
 * The DB comes from DATABASE_URL (.env); mock vs real from WD_MODE.
 * `70-reports.ts` is owned by the reports agent; when absent the runner warns
 * and carries on.
 */

const EXPECTED = ["10", "20", "30", "40", "45", "50", "60", "70"];

function parseList(flag: string): Set<string> | null {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return null;
  return new Set(arg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean));
}

type StepModule = {
  step?: SeedStep;
  default?: SeedStep | ((ctx: SeedContext) => Promise<SeedCounts | void>);
  run?: (ctx: SeedContext) => Promise<SeedCounts | void>;
  name?: string;
};

function resolveStep(mod: StepModule, file: string): SeedStep {
  const fallbackName = file.replace(/^\d+-/, "").replace(/\.ts$/, "");
  if (mod.step) return mod.step;
  const d = mod.default;
  if (typeof d === "function") return { name: fallbackName, run: d };
  if (d && typeof d === "object" && typeof d.run === "function") return d;
  if (typeof mod.run === "function") return { name: mod.name ?? fallbackName, run: mod.run };
  throw new Error(`${file}: exports no seed step (expected \`export const step\` or a default export)`);
}

function fmtCounts(c: SeedCounts | void): string {
  if (!c) return "";
  return Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const stepsDir = path.join(root, "scripts", "seed-steps");
  const only = parseList("only");
  const skip = parseList("skip");

  const files = readdirSync(stepsDir)
    .filter((f) => /^\d{2}-[\w-]+\.ts$/.test(f))
    .sort();
  const present = new Set(files.map((f) => f.slice(0, 2)));
  for (const n of EXPECTED) {
    if (!present.has(n) && (!only || only.has(n))) {
      console.warn(`[seed] WARN step ${n} file is missing in scripts/seed-steps — skipped`);
    }
  }

  const { db, pool } = await import("@/db");
  const { env } = await import("@/lib/env");
  const ctx: SeedContext = {
    db,
    pool,
    mode: env.WD_MODE,
    root,
    log: (m) => console.log(`        ${m}`),
    warn: (m) => console.warn(`        WARN ${m}`),
  };

  const dbHost = env.DATABASE_URL.replace(/\/\/[^@]*@/, "//***@");
  console.log(`[seed] db=${dbHost} mode=${ctx.mode} steps=${files.length}`);
  const t0 = Date.now();
  let failed = false;
  try {
    for (const file of files) {
      const num = file.slice(0, 2);
      if (only && !only.has(num)) continue;
      if (skip?.has(num)) {
        console.log(`[seed] ${file} skipped (--skip)`);
        continue;
      }
      const mod = (await import(pathToFileURL(path.join(stepsDir, file)).href)) as StepModule;
      const step = resolveStep(mod, file);
      const ts = Date.now();
      console.log(`[seed] ▶ ${num} ${step.name}`);
      const counts = await step.run(ctx);
      console.log(
        `[seed] ✔ ${num} ${step.name} ${fmtCounts(counts)} (${((Date.now() - ts) / 1000).toFixed(1)}s)`,
      );
    }
    console.log(`[seed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    failed = true;
    console.error(`[seed] FAILED:`, err);
  } finally {
    await pool.end();
  }
  if (failed) process.exit(1);
}

void main();
