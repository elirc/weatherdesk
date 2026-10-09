import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import spec from "../../../public/openapi.json";

export const metadata: Metadata = {
  title: "API documentation",
  description: "WeatherDesk public API v1: forecasts, history, normals, advisories and reports for every Nigerian LGA.",
  alternates: { canonical: "/api-docs" },
};

/**
 * /api-docs — static, server-rendered view of public/openapi.json (no doc-UI
 * dependency). Endpoint list, parameter tables and curl examples.
 */

type Param = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string | string[]; enum?: string[]; default?: unknown; minimum?: number; maximum?: number; pattern?: string; format?: string };
  example?: unknown;
};
type Operation = {
  summary: string;
  description?: string;
  operationId: string;
  tags?: string[];
  parameters?: (Param | { $ref: string })[];
  responses: Record<string, { $ref?: string; description?: string }>;
};

const s = spec as unknown as {
  info: { title: string; version: string; description: string };
  paths: Record<string, { get: Operation }>;
  components: {
    parameters: Record<string, Param>;
    headers: Record<string, { description: string }>;
    responses: Record<string, { description: string }>;
  };
};

function resolveParam(p: Param | { $ref: string }): Param {
  if ("$ref" in p) return s.components.parameters[p.$ref.split("/").pop()!]!;
  return p;
}

function typeLabel(p: Param): string {
  const sc = p.schema ?? {};
  const t = Array.isArray(sc.type) ? sc.type.join(" | ") : (sc.type ?? "string");
  const extra: string[] = [];
  if (sc.enum) extra.push(sc.enum.join(" | "));
  if (sc.format) extra.push(sc.format);
  if (sc.minimum !== undefined || sc.maximum !== undefined) extra.push(`${sc.minimum ?? ""}–${sc.maximum ?? ""}`);
  if (sc.default !== undefined) extra.push(`default ${String(sc.default)}`);
  return extra.length ? `${t} (${extra.join(", ")})` : t;
}

const EXAMPLES: Record<string, string> = {
  "/api/v1/forecast": "?lga=ikeja&hourly=true",
  "/api/v1/history": "?lga=ikeja&from=2026-01-01&to=2026-03-31",
  "/api/v1/normals": "?lga=ikeja",
  "/api/v1/alerts": "?state=NG-KD&active=true",
  "/api/v1/reports": "?type=weekly&scope=national&limit=5",
};

export default function ApiDocsPage() {
  const paths = Object.entries(s.paths);
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold">{s.info.title}</h1>
          <Badge variant="outline">v{s.info.version}</Badge>
          <Badge variant="secondary">OpenAPI 3.1</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{s.info.description}</p>
        <p className="text-sm">
          <a href="/openapi.json" className="underline underline-offset-4">
            Download openapi.json
          </a>{" "}
          ·{" "}
          <Link href="/org" className="underline underline-offset-4">
            Get an API key
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication &amp; limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            <code>{`curl -H "Authorization: Bearer wd_live_YOUR_KEY" \\\n  "https://YOUR_HOST/api/v1/forecast?lga=ikeja"`}</code>
          </pre>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>No key: unauthenticated preview, 60 requests/minute per IP, marked with an <code>X-WeatherDesk-Notice</code> header.</li>
            <li>With a key: your plan&apos;s calls per day (Free 100, Basic 10,000, Pro 100,000) plus a per-minute burst limit.</li>
            <li>Over a limit → <code>429</code> with <code>Retry-After</code>; error code <code>rate_limited</code> or <code>quota_exceeded</code>.</li>
            <li>A malformed, unknown or revoked key is a <code>401</code> — never silently downgraded to anonymous.</li>
          </ul>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-3 font-medium">Response header</th>
                <th className="py-1 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.components.headers).map(([k, v]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-1 pr-3 font-mono">{k}</td>
                  <td className="py-1 text-muted-foreground">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <nav aria-label="Endpoints" className="flex flex-wrap gap-2 text-sm">
        {paths.map(([path, item]) => (
          <a key={path} href={`#${item.get.operationId}`} className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-muted">
            GET {path}
          </a>
        ))}
      </nav>

      {paths.map(([path, item]) => {
        const op = item.get;
        const params = (op.parameters ?? []).map(resolveParam);
        return (
          <Card key={path} id={op.operationId} className="scroll-mt-20">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>GET</Badge>
                <code className="font-mono text-sm">{path}</code>
                {op.tags?.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
              <CardTitle className="text-base">{op.summary}</CardTitle>
              {op.description && <CardDescription>{op.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {params.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1 pr-3 font-medium">Parameter</th>
                        <th className="py-1 pr-3 font-medium">Type</th>
                        <th className="py-1 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.map((p) => (
                        <tr key={p.name} className="border-b align-top last:border-0">
                          <td className="py-1 pr-3 font-mono">
                            {p.name}
                            {p.required && <span className="text-destructive"> *</span>}
                          </td>
                          <td className="py-1 pr-3 text-muted-foreground">{typeLabel(p)}</td>
                          <td className="py-1 text-muted-foreground">
                            {p.description}
                            {p.example !== undefined && (
                              <>
                                {" "}
                                e.g. <code>{String(p.example)}</code>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                <code>{`curl -s -H "Authorization: Bearer wd_live_YOUR_KEY" \\\n  "https://YOUR_HOST${path}${EXAMPLES[path] ?? ""}"`}</code>
              </pre>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {Object.entries(op.responses).map(([code, r]) => (
                  <span key={code} className="rounded border px-2 py-0.5">
                    <span className="font-mono">{code}</span>{" "}
                    {r.description ?? (r.$ref ? s.components.responses[r.$ref.split("/").pop()!]?.description : "")}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Response envelope: <code>{"{ data, meta: { source, fetchedAt, attribution } }"}</code>; errors:{" "}
        <code>{"{ error: { code, message } }"}</code>. Weather data © Open-Meteo (CC BY 4.0), NASA POWER; boundaries geoBoundaries /
        GRID3; map data © OpenStreetMap contributors. Independent service — not affiliated with NiMet. Advisories are not official
        warnings.
      </p>
    </div>
  );
}
