import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const specPath = path.join(root, "public/openapi.json");
const v1Dir = path.join(root, "src/app/api/v1");

type Spec = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown>; parameters?: { $ref?: string }[] }>>;
  components: Record<string, Record<string, unknown>>;
};

const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;

function routeDirs(dir: string, prefix = "/api/v1"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    const p = `${prefix}/${name}`;
    if (existsSync(path.join(full, "route.ts"))) out.push(p);
    out.push(...routeDirs(full, p));
  }
  return out;
}

function collectRefs(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => collectRefs(x, acc));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "$ref" && typeof x === "string") acc.push(x);
      else collectRefs(x, acc);
    }
  }
  return acc;
}

describe("public/openapi.json", () => {
  it("is valid JSON declaring OpenAPI 3.1", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info.title).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("every documented path exists as a route handler in src/app/api/v1", () => {
    for (const p of Object.keys(spec.paths)) {
      const file = path.join(root, "src/app", p, "route.ts");
      expect(existsSync(file), `${p} → ${file}`).toBe(true);
    }
  });

  it("every v1 route handler is documented", () => {
    const documented = new Set(Object.keys(spec.paths));
    for (const r of routeDirs(v1Dir)) expect(documented.has(r), `${r} missing from openapi.json`).toBe(true);
  });

  it("documented methods are exported by the route file", () => {
    for (const [p, item] of Object.entries(spec.paths)) {
      const src = readFileSync(path.join(root, "src/app", p, "route.ts"), "utf8");
      for (const method of Object.keys(item)) {
        expect(src, `${method.toUpperCase()} ${p}`).toMatch(new RegExp(`export (async )?function ${method.toUpperCase()}\\b`));
      }
    }
  });

  it("all $refs resolve and operationIds are unique", () => {
    for (const ref of collectRefs(spec)) {
      const parts = ref.replace(/^#\//, "").split("/");
      let cur: unknown = spec;
      for (const part of parts) cur = (cur as Record<string, unknown> | undefined)?.[part];
      expect(cur, ref).toBeDefined();
    }
    const ids = Object.values(spec.paths).flatMap((i) => Object.values(i).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
