import "server-only";
import { cacheLife } from "next/cache";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { d3Winding } from "@/reports/svg-maps";
import { getNationalLgaCollection, getStatesCollection } from "@/server/queries/geo";

/**
 * Active-alerts map of Nigeria, rendered on the server as inline SVG from
 * the pre-simplified boundary layers (CONVENTIONS rule 4). No client JS and
 * no map tiles — lighter than a MapLibre island on slow phones. State
 * outlines are the base layer; only LGAs with active alerts are filled,
 * coloured by their highest severity. Each LGA links to its place page.
 */

const W = 640;
const H = 560;

type Base = { states: { d: string; name: string }[]; lgaPaths: Record<number, { d: string; name: string; slug: string }> };

async function baseLayer(): Promise<Base> {
  "use cache";
  cacheLife("days");
  const [st, lg] = await Promise.all([getStatesCollection(), getNationalLgaCollection()]);
  // d3-geo expects @types/geojson shapes; ours are structurally identical
  // (src/lib/geo/types.ts) — but RFC 7946 ring winding must be reversed for
  // d3's spherical model or a polygon fills the whole world (d3Winding).
  const feat = (geometry: unknown): GeoPermissibleObjects =>
    ({
      type: "Feature",
      properties: {},
      geometry: d3Winding(geometry as Parameters<typeof d3Winding>[0]),
    }) as unknown as GeoPermissibleObjects;
  const stFixed = {
    type: "FeatureCollection",
    features: st.features.map((f) => feat(f.geometry)),
  } as unknown as GeoPermissibleObjects & { type: "FeatureCollection" };
  const projection = geoMercator().fitSize([W, H], stFixed);
  const path = geoPath(projection).digits(1);
  const states = st.features.map((f) => ({
    name: f.properties.name,
    d: path(feat(f.geometry)) ?? "",
  }));
  const lgaPaths: Base["lgaPaths"] = {};
  for (const f of lg.features) {
    lgaPaths[f.properties.id] = {
      d: path(feat(f.geometry)) ?? "",
      name: f.properties.name,
      slug: f.properties.slug,
    };
  }
  return { states, lgaPaths };
}

export const SEVERITY_FILL = { high: "#dc2626", moderate: "#f59e0b" } as const;

export async function AlertsMap({ lgas }: { lgas: { lgaId: number; severity: "moderate" | "high" }[] }) {
  const base = await baseLayer();
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-xl"
        role="img"
        aria-label={`Map of Nigeria with ${lgas.length} LGA${lgas.length === 1 ? "" : "s"} under active advisories`}
      >
        <g fill="var(--muted)" stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={0.6}>
          {base.states.map((s) => (
            <path key={s.name} d={s.d}>
              <title>{s.name}</title>
            </path>
          ))}
        </g>
        <g stroke="#fff" strokeWidth={0.4}>
          {lgas.map((l) => {
            const p = base.lgaPaths[l.lgaId];
            if (!p?.d) return null;
            return (
              <a key={l.lgaId} href={`/place/lga/${p.slug}`}>
                <path d={p.d} fill={SEVERITY_FILL[l.severity]}>
                  <title>
                    {p.name} — {l.severity} advisory
                  </title>
                </path>
              </a>
            );
          })}
        </g>
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm" style={{ background: SEVERITY_FILL.high }} /> High
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm" style={{ background: SEVERITY_FILL.moderate }} /> Moderate
        </span>
        <span>Boundaries: geoBoundaries (simplified)</span>
      </figcaption>
    </figure>
  );
}
