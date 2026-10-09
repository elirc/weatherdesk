/**
 * Conservative sanitiser for report map SVG strings before they are inlined
 * with dangerouslySetInnerHTML (pure, string-based — no DOM on the server).
 *
 * The SVGs come from our own report engine, so this is defence in depth:
 * - the string must be a single <svg …>…</svg> document, otherwise dropped
 * - removes script/foreignObject/iframe/object/embed/style/use/image/a
 *   elements, comments, CDATA, processing instructions and DOCTYPE
 * - removes every on* event-handler attribute
 * - removes href / xlink:href attributes (maps need no links or references)
 * - removes attribute values containing javascript:, data:, vbscript: or url(
 *   that point outside the document (only url(#id) is kept)
 * Returns null when nothing safe is left.
 */

const DANGEROUS_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "style",
  "use",
  "image",
  "a",
  "animate",
  "set",
  "handler",
  "listener",
];

export function sanitizeSvg(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  // strip XML prolog / doctype / comments / CDATA / PIs
  s = s.replace(/<\?[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  s = s.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>$/i.test(s)) return null;

  for (const el of DANGEROUS_ELEMENTS) {
    // paired elements (content included), then self-closing / stray tags
    s = s.replace(new RegExp(`<${el}\\b[\\s\\S]*?<\\/${el}\\s*>`, "gi"), "");
    s = s.replace(new RegExp(`<\\/?${el}\\b[^>]*>`, "gi"), "");
  }
  // event handlers: on*="…" | on*='…' | on*=bare
  s = s.replace(/\s+on[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // links / references
  s = s.replace(/\s+(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // dangerous values in any remaining attribute
  s = s.replace(
    /\s+[a-z_:][a-z0-9_.:-]*\s*=\s*("[^"]*"|'[^']*')/gi,
    (attr: string, value: string) => {
      const v = value.slice(1, -1).toLowerCase().replace(/\s+/g, "");
      if (/javascript:|vbscript:|data:/.test(v)) return "";
      if (/url\((?!#)/.test(v)) return "";
      if (/expression\(/.test(v)) return "";
      return attr;
    },
  );
  return /^<svg[\s>]/i.test(s) ? s : null;
}
