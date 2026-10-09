/**
 * Report map as a lazy-loaded image. The SVG itself is served (sanitised,
 * image/svg+xml, versioned + cached) by /reports/[id]/map/[key], so the
 * ~280 KB map markup stays out of the page HTML and RSC payload. Width and
 * height come from the SVG viewBox so the image reserves its space (no
 * layout shift); a 4:3 box is used when the viewBox is unknown.
 */
export function ReportMap({
  reportId,
  mapKey,
  title,
  viewBox,
  version,
}: {
  reportId: string;
  mapKey: string;
  title: string;
  viewBox: string | null;
  /** reports.updated_at in ms — busts caches on republish */
  version: number;
}) {
  const vb = viewBox?.trim().split(/[\s,]+/).map(Number);
  const ok = vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const width = ok ? Math.round(vb![2]) : 800;
  const height = ok ? Math.round(vb![3]) : 600;
  const src = `/reports/${encodeURIComponent(reportId)}/map/${encodeURIComponent(mapKey)}?v=${version}`;
  return (
    <figure className="space-y-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG from our own route; next/image adds nothing for SVG */}
      <img
        src={src}
        alt={title}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-md border bg-white"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
    </figure>
  );
}

const BAND_STYLE: Record<string, string> = {
  "above normal": "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  "near normal": "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "below normal": "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
};

/** Percent-of-normal band chip (colours match the month-so-far card). */
export function BandChip({ band, pct }: { band: string | null; pct: number | null }) {
  if (!band && pct == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${band ? BAND_STYLE[band] ?? "bg-muted" : "bg-muted"}`}>
      {pct != null ? `${pct}%` : ""}
      {band ? `${pct != null ? " · " : ""}${band}` : ""}
    </span>
  );
}

/** Report status chip: preliminary (amber) / final (green). */
export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "final"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{status}</span>;
}
