import { z } from "zod";
import { embedSnippet, WIDGET_KINDS, type WidgetKind } from "@/components/forecast/embed-snippet";
import { env } from "@/lib/env";
import { resolvePlace } from "@/app/(public)/place/resolve";

/**
 * GET /api/widget/embed?kind=lga&id=ikeja[&width=320&height=300]
 * → copy-paste iframe snippet (text/plain).
 */

const querySchema = z.object({
  kind: z.enum(WIDGET_KINDS as [WidgetKind, ...WidgetKind[]]),
  id: z.string().trim().min(1).max(120),
  width: z.coerce.number().int().min(200).max(800).optional(),
  height: z.coerce.number().int().min(150).max(800).optional(),
});

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    kind: sp.get("kind") ?? undefined,
    id: sp.get("id") ?? undefined,
    width: sp.get("width") ?? undefined,
    height: sp.get("height") ?? undefined,
  });
  if (!parsed.success) {
    return new Response("Usage: /api/widget/embed?kind=state|lga|settlement&id=<slug or id>\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const { kind, id, width, height } = parsed.data;
  const ctx = await resolvePlace(kind, id);
  if (!ctx || !ctx.widget) {
    return new Response("Place not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const snippet = embedSnippet({ origin: env.APP_URL, kind, id: ctx.widget.id, name: ctx.name, width, height });
  return new Response(`${snippet}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
