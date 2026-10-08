/**
 * Minimal GeoJSON shapes for boundary layers (structurally compatible with
 * @types/geojson, which is not a direct dependency of the app).
 */
export type Position = number[];

export type AreaGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type AreaFeature<P> = {
  type: "Feature";
  id?: number;
  properties: P;
  geometry: AreaGeometry;
};

export type AreaFeatureCollection<P> = {
  type: "FeatureCollection";
  features: AreaFeature<P>[];
};

/** Properties on every feature served by src/lib/geo/simplified.ts. */
export type BoundaryProps = {
  id: number;
  slug: string;
  name: string;
};

export type LgaBoundaryProps = BoundaryProps & { stateSlug: string; zone: string };
export type StateBoundaryProps = BoundaryProps & { code: string; zone: string };
