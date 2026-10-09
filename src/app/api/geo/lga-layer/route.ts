import { cacheLife } from "next/cache";
import { z } from "zod";
import { LAYER_DEFS, LAYER_IDS, type MapLayerId } from "@/components/map/layers";
import { getNationalLgaCollection } from "@/server/queries/geo";
import { layerAggregates } from "@/server/queries/weather";

/**
 * GET /api/geo/lga-layer?layer=rain_today|tmax_today|rain_7d|alerts
 * Simplified national LGA FeatureCollection with `value` joined per feature
 * for the requested layer. The only place boundary GeoJSON reaches clients
 * (page props stay lean). CDN-cacheable for 30 min.
 */

const querySchema = z.object({
  layer: z.enum(LAYER_IDS as [MapLayerId, ...MapLayerId[]]).default("rain_today"),
});

async function buildLayer(layer: MapLayerId) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  const [fc, agg] = await Promise.all([getNationalLgaCollection(), layerAggregates(layer)]);
  return {
    type: "FeatureCollection" as const,
    meta: {
      layer,
      label: LAYER_DEFS[layer].label,
      unit: LAYER_DEFS[layer].unit,
      source: agg.source,
      fetchedAt: agg.fetchedAt ? agg.fetchedAt.toISOString() : null,
    },
    features: fc.features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: {
        id: f.properties.id,
        slug: f.properties.slug,
        name: f.properties.name,
        stateSlug: f.properties.stateSlug,
        value: agg.values[f.properties.id] ?? null,
      },
      geometry: f.geometry,
    })),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ layer: url.searchParams.get("layer") ?? undefined });
  if (!parsed.success) {
    return Response.json(
      { error: "invalid layer", allowed: LAYER_IDS },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = await buildLayer(parsed.data.layer);
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
    },
  });
}
