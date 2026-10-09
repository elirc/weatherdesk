"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from "maplibre-gl";

// MapLibre v6 derives its worker URL from import.meta.url, which points at the
// bundled chunk under Turbopack ("Worker failed to load"). Emit the
// self-contained worker as an asset and hand MapLibre its URL explicitly.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
import {
  fillColorExpression,
  formatLayerValue,
  LAYER_DEFS,
  LAYER_IDS,
  legendItems,
  type MapLayerId,
} from "./layers";

/**
 * National LGA choropleth (client island). Boundaries + values come from the
 * cached /api/geo/lga-layer route — never through page props.
 */

const NIGERIA_BOUNDS: [[number, number], [number, number]] = [
  [2.6, 4.2],
  [14.7, 13.95],
];

const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#f8fafc" } }],
};

type Hover = { id: number; name: string; value: number | null; x: number; y: number };

export function LgaMap({ styleUrl, initialLayer = "rain_today" }: { styleUrl?: string; initialLayer?: MapLayerId }) {
  const router = useRouter();
  const [layer, setLayer] = useState<MapLayerId>(initialLayer);
  const [hover, setHover] = useState<Hover | null>(null);
  const [styleFailed, setStyleFailed] = useState(false);
  const def = LAYER_DEFS[layer];
  const dataUrl = `/api/geo/lga-layer?layer=${layer}`;
  const fillColor = useMemo(() => fillColorExpression(def) as unknown as ExpressionSpecification, [def]);
  const legend = useMemo(() => legendItems(def), [def]);

  const onMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) {
      setHover(null);
      return;
    }
    const p = f.properties as { id: number; name: string; value?: number | null };
    setHover({
      id: Number(p.id),
      name: p.name,
      value: typeof p.value === "number" ? p.value : null,
      x: e.point.x,
      y: e.point.y,
    });
  }, []);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const slug = (e.features?.[0]?.properties as { slug?: string } | undefined)?.slug;
      if (slug) router.push(`/place/lga/${slug}`);
    },
    [router],
  );

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Map layer" className="flex flex-wrap gap-1">
        {LAYER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={layer === id}
            onClick={() => setLayer(id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              layer === id ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            {LAYER_DEFS[id].shortLabel}
          </button>
        ))}
      </div>
      <div className="relative h-[420px] w-full overflow-hidden rounded-lg border sm:h-[520px]">
        <Map
          initialViewState={{ bounds: NIGERIA_BOUNDS, fitBoundsOptions: { padding: 8 } }}
          mapStyle={styleUrl && !styleFailed ? styleUrl : BLANK_STYLE}
          interactiveLayerIds={["lga-fill"]}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
          onError={(e) => {
            // basemap unreachable on a bad connection → fall back to a blank style
            if (!styleFailed && String(e.error?.message ?? "").toLowerCase().includes("style")) setStyleFailed(true);
          }}
          cursor={hover ? "pointer" : "grab"}
          dragRotate={false}
          touchPitch={false}
          minZoom={4}
          maxZoom={10}
          attributionControl={{ compact: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <Source id="lgas" type="geojson" data={dataUrl} promoteId="id">
            <Layer
              id="lga-fill"
              type="fill"
              paint={{ "fill-color": fillColor, "fill-opacity": 0.78 }}
            />
            <Layer id="lga-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 0.4 }} />
            <Layer
              id="lga-hover"
              type="line"
              filter={["==", ["get", "id"], hover?.id ?? -1]}
              paint={{ "line-color": "#111827", "line-width": 2 }}
            />
          </Source>
        </Map>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
            style={{ left: Math.min(hover.x + 12, 9999), top: Math.max(hover.y - 36, 4) }}
          >
            <p className="font-medium">{hover.name}</p>
            <p className="tabular-nums text-muted-foreground">
              {def.shortLabel}: {formatLayerValue(def, hover.value)}
            </p>
          </div>
        )}
        <div className="absolute bottom-2 left-2 z-10 rounded-md border bg-background/90 p-2 text-[11px] shadow-sm">
          <p className="mb-1 font-medium">{def.label}</p>
          <ul className="space-y-0.5">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block size-3 rounded-sm border" style={{ background: l.color }} />
                {l.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Tap or click an LGA to open its forecast.</p>
    </div>
  );
}
