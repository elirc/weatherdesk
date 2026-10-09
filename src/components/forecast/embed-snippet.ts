/**
 * Copy-paste iframe snippet for the embeddable widget (/widget/<kind>/<id>).
 * Pure — shared by the place-page "Embed" details and /api/widget/embed.
 */

export type WidgetKind = "state" | "lga" | "settlement";
export const WIDGET_KINDS: readonly WidgetKind[] = ["state", "lga", "settlement"];

export function widgetPath(kind: WidgetKind, id: string | number): string {
  return `/widget/${kind}/${encodeURIComponent(String(id))}`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function embedSnippet(opts: {
  origin: string;
  kind: WidgetKind;
  id: string | number;
  name: string;
  width?: number;
  height?: number;
}): string {
  const origin = opts.origin.replace(/\/+$/, "");
  const src = `${origin}${widgetPath(opts.kind, opts.id)}`;
  const w = opts.width ?? 320;
  const h = opts.height ?? 300;
  return (
    `<iframe src="${escapeAttr(src)}" title="${escapeAttr(`${opts.name} weather — WeatherDesk`)}" ` +
    `width="${w}" height="${h}" style="border:0;max-width:100%" loading="lazy"></iframe>`
  );
}
