import "server-only";
import { cacheLife } from "next/cache";
import type { Zone } from "@/lib/geo/zones";
import { ZONE_LABELS } from "@/lib/geo/zones";
import {
  getLgaBySlug,
  getLgaForPoint,
  getSettlementById,
  getStateBySlug,
  listLgasForState,
} from "@/server/queries/geo";
import { cellAtPoint, nearestActiveCell } from "@/server/queries/weather";
import { formatCoords, parsePointKey } from "./point-params";

/**
 * Shared place resolver for every place route (Forecast tab here; Climate /
 * History / Farming tabs by A4). Cached (`use cache`), serializable, and
 * free of boundary GeoJSON.
 *
 *   const ctx = await resolvePlace("lga", "ikeja");          // null → notFound()
 *   const ctx = await resolvePlace("settlement", "42");
 *   const ctx = await resolvePlace("state", "lagos");
 *   const ctx = await resolvePlace("point", "6.524,3.379");  // see pointKey()
 *
 * Cell choice: LGA → its own cell; settlement → its LGA's cell; state → the
 * cell of the LGA whose centre is nearest the state centroid; point → the
 * exact 0.1° cell if active, else the nearest active cell within 0.3°
 * (`needsActivation` = true so the page can enqueue cell.activate).
 */

export type PlaceKind = "state" | "lga" | "settlement" | "point";

export type Breadcrumb = { label: string; href: string | null };

export type PlaceContext = {
  kind: PlaceKind;
  /** DB id of the state / LGA / settlement (null for points) */
  id: number | null;
  /** slug for states + LGAs, null otherwise */
  slug: string | null;
  name: string;
  /** e.g. "Ikeja LGA, Lagos" — subtitle line */
  subtitle: string;
  /** canonical URL of the Forecast tab: /place/lga/ikeja, /place/point?lat=…&lon=… */
  basePath: string;
  /** base for sub-tabs (/climate, /history, /farming); null when the kind has none */
  tabBasePath: string | null;
  breadcrumbs: Breadcrumb[];
  lat: number;
  lon: number;
  /** grid cell whose forecast is shown (null when nothing is available yet) */
  gridCellId: number | null;
  /** how gridCellId was chosen */
  cellMatch: "own" | "lga" | "state-centre" | "nearest" | "none";
  /** human note on the cell choice, e.g. "near Ikeja LGA (state centre)" */
  cellNote: string | null;
  lgaId?: number;
  lgaSlug?: string;
  lgaName?: string;
  stateId?: number;
  stateSlug?: string;
  stateName?: string;
  zone: Zone | null;
  zoneLabel: string | null;
  /** notices scope for this place: 'place:<kind>:<id>' */
  noticeScope: string | null;
  /** widget identity (null for points) */
  widget: { kind: "state" | "lga" | "settlement"; id: string } | null;
  /** points only: no exact active cell — page should enqueue cell.activate */
  needsActivation: boolean;
};

function dist2(aLat: number, aLon: number, bLat: number, bLon: number) {
  return (aLat - bLat) ** 2 + (aLon - bLon) ** 2;
}

export async function resolvePlace(kind: PlaceKind, slugOrId: string): Promise<PlaceContext | null> {
  "use cache";
  cacheLife(kind === "point" ? { stale: 60, revalidate: 300, expire: 3600 } : { stale: 300, revalidate: 1800, expire: 86400 });

  switch (kind) {
    case "state":
      return resolveState(slugOrId);
    case "lga":
      return resolveLga(slugOrId);
    case "settlement":
      return resolveSettlement(slugOrId);
    case "point":
      return resolvePoint(slugOrId);
    default:
      return null;
  }
}

async function resolveState(slug: string): Promise<PlaceContext | null> {
  const s = await getStateBySlug(slug);
  if (!s) return null;
  const lgas = (await listLgasForState(s.id)).filter((l) => l.gridCellId !== null);
  let centre: (typeof lgas)[number] | null = null;
  for (const l of lgas) {
    if (!centre || dist2(l.centreLat, l.centreLon, s.centreLat, s.centreLon) < dist2(centre.centreLat, centre.centreLon, s.centreLat, s.centreLon)) {
      centre = l;
    }
  }
  const base = `/place/state/${s.slug}`;
  return {
    kind: "state",
    id: s.id,
    slug: s.slug,
    name: s.name,
    subtitle: `${s.name === "Federal Capital Territory" ? "" : "State · "}${ZONE_LABELS[s.zone]}`,
    basePath: base,
    tabBasePath: base,
    breadcrumbs: [
      { label: "Nigeria", href: "/" },
      { label: s.name, href: null },
    ],
    lat: s.centreLat,
    lon: s.centreLon,
    gridCellId: centre?.gridCellId ?? null,
    cellMatch: centre ? "state-centre" : "none",
    cellNote: centre ? `Forecast for the state centre (near ${centre.name})` : null,
    stateId: s.id,
    stateSlug: s.slug,
    stateName: s.name,
    zone: s.zone,
    zoneLabel: ZONE_LABELS[s.zone],
    noticeScope: `place:state:${s.id}`,
    widget: { kind: "state", id: s.slug },
    needsActivation: false,
  };
}

async function resolveLga(slug: string): Promise<PlaceContext | null> {
  const l = await getLgaBySlug(slug);
  if (!l) return null;
  const base = `/place/lga/${l.slug}`;
  return {
    kind: "lga",
    id: l.id,
    slug: l.slug,
    name: l.name,
    subtitle: `LGA · ${l.state.name} · ${ZONE_LABELS[l.zone]}`,
    basePath: base,
    tabBasePath: base,
    breadcrumbs: [
      { label: "Nigeria", href: "/" },
      { label: l.state.name, href: `/place/state/${l.state.slug}` },
      { label: l.name, href: null },
    ],
    lat: l.centreLat,
    lon: l.centreLon,
    gridCellId: l.gridCellId,
    cellMatch: l.gridCellId ? "own" : "none",
    cellNote: null,
    lgaId: l.id,
    lgaSlug: l.slug,
    lgaName: l.name,
    stateId: l.state.id,
    stateSlug: l.state.slug,
    stateName: l.state.name,
    zone: l.zone,
    zoneLabel: ZONE_LABELS[l.zone],
    noticeScope: `place:lga:${l.id}`,
    widget: { kind: "lga", id: l.slug },
    needsActivation: false,
  };
}

async function resolveSettlement(idStr: string): Promise<PlaceContext | null> {
  if (!/^\d+$/.test(idStr)) return null;
  const t = await getSettlementById(Number(idStr));
  if (!t) return null;
  const base = `/place/settlement/${t.id}`;
  return {
    kind: "settlement",
    id: t.id,
    slug: null,
    name: t.name,
    subtitle: `${t.kind ? `${t.kind[0].toUpperCase()}${t.kind.slice(1)} · ` : ""}${t.lga.name} LGA, ${t.state.name}`,
    basePath: base,
    tabBasePath: base,
    breadcrumbs: [
      { label: "Nigeria", href: "/" },
      { label: t.state.name, href: `/place/state/${t.state.slug}` },
      { label: t.lga.name, href: `/place/lga/${t.lga.slug}` },
      { label: t.name, href: null },
    ],
    lat: t.lat,
    lon: t.lon,
    gridCellId: t.lga.gridCellId,
    cellMatch: t.lga.gridCellId ? "lga" : "none",
    cellNote: t.lga.gridCellId ? `Forecast for the ${t.lga.name} LGA grid cell` : null,
    lgaId: t.lga.id,
    lgaSlug: t.lga.slug,
    lgaName: t.lga.name,
    stateId: t.state.id,
    stateSlug: t.state.slug,
    stateName: t.state.name,
    zone: t.zone,
    zoneLabel: ZONE_LABELS[t.zone],
    noticeScope: `place:settlement:${t.id}`,
    widget: { kind: "settlement", id: String(t.id) },
    needsActivation: false,
  };
}

async function resolvePoint(key: string): Promise<PlaceContext | null> {
  const p = parsePointKey(key);
  if (!p) return null;
  const { lat, lon } = p;
  const [loc, exact] = await Promise.all([getLgaForPoint(lat, lon), cellAtPoint(lat, lon)]);

  let gridCellId: number | null = null;
  let cellMatch: PlaceContext["cellMatch"] = "none";
  let cellNote: string | null = null;
  let needsActivation = false;

  if (exact?.active) {
    gridCellId = exact.id;
    cellMatch = "own";
  } else {
    needsActivation = true;
    const near = await nearestActiveCell(lat, lon, 0.3);
    if (near) {
      gridCellId = near.id;
      cellMatch = "nearest";
      cellNote = `Nearest available forecast cell (${formatCoords(near.centreLat, near.centreLon)})`;
    } else if (loc?.gridCellId) {
      gridCellId = loc.gridCellId;
      cellMatch = "lga";
      cellNote = `Forecast for the ${loc.lgaName} LGA grid cell`;
    }
  }

  const coords = formatCoords(lat, lon);
  const crumbs: Breadcrumb[] = [{ label: "Nigeria", href: "/" }];
  if (loc) {
    crumbs.push({ label: loc.stateName, href: `/place/state/${loc.stateSlug}` });
    crumbs.push({ label: loc.lgaName, href: `/place/lga/${loc.lgaSlug}` });
  }
  crumbs.push({ label: coords, href: null });

  return {
    kind: "point",
    id: null,
    slug: null,
    name: loc ? `Near ${loc.lgaName}` : coords,
    subtitle: loc ? `${coords} · ${loc.lgaName} LGA, ${loc.stateName}` : "Point forecast · outside mapped LGA boundaries",
    basePath: `/place/point?lat=${lat}&lon=${lon}`,
    tabBasePath: loc ? `/place/lga/${loc.lgaSlug}` : null,
    breadcrumbs: crumbs,
    lat,
    lon,
    gridCellId,
    cellMatch,
    cellNote,
    lgaId: loc?.lgaId,
    lgaSlug: loc?.lgaSlug,
    lgaName: loc?.lgaName,
    stateId: loc?.stateId,
    stateSlug: loc?.stateSlug,
    stateName: loc?.stateName,
    zone: loc?.zone ?? null,
    zoneLabel: loc ? ZONE_LABELS[loc.zone] : null,
    noticeScope: null,
    widget: null,
    needsActivation,
  };
}
