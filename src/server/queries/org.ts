import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apiKeys,
  apiUsage,
  customAreas,
  forecastDaily,
  gridCells,
  invitations,
  lgas,
  members,
  observedDaily,
  organizations,
  reports,
  states,
  users,
} from "@/db/schema";
import { parseOrgMetadata } from "@/lib/api/misc";
import type { MultiPolygonGeometry } from "@/lib/api/geojson";

/**
 * Organisation queries (A6). Every read/write takes organizationId and
 * filters on it in the WHERE clause (CONVENTIONS 7). Callers have already
 * run requireOrgMember for that organisation.
 */

// ── Organisations, members, invitations ────────────────────────────────

export async function listUserOrgs(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(asc(organizations.name));
}

export type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  brandTitle: string | null;
  createdAt: Date;
};

export async function getOrg(organizationId: string): Promise<OrgDetail | null> {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!o) return null;
  const meta = parseOrgMetadata(o.metadata);
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    logo: o.logo,
    brandTitle: typeof meta.brandTitle === "string" ? meta.brandTitle : null,
    createdAt: o.createdAt,
  };
}

export async function listMembers(organizationId: string) {
  return db
    .select({ id: members.id, userId: users.id, name: users.name, email: users.email, role: members.role, createdAt: members.createdAt })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, organizationId))
    .orderBy(asc(members.createdAt));
}

export async function listPendingInvitations(organizationId: string) {
  return db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "pending")))
    .orderBy(desc(invitations.createdAt));
}

/** Members + live pending invitations — what counts against plans.limits.teamMembers. */
export async function countSeats(organizationId: string, now = new Date()): Promise<number> {
  const [[m], [i]] = await Promise.all([
    db.select({ n: count() }).from(members).where(eq(members.organizationId, organizationId)),
    db
      .select({ n: count() })
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "pending"), gte(invitations.expiresAt, now))),
  ]);
  return Number(m?.n ?? 0) + Number(i?.n ?? 0);
}

export async function getInvitation(id: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      organizationId: invitations.organizationId,
      orgName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.id, id))
    .limit(1);
  return row ?? null;
}

// ── Branding ───────────────────────────────────────────────────────────

export async function updateOrgBranding(
  organizationId: string,
  patch: { logo?: string | null; brandTitle?: string | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [o] = await tx
      .select({ metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1)
      .for("update");
    if (!o) return;
    const meta = parseOrgMetadata(o.metadata);
    if (patch.brandTitle !== undefined) {
      if (patch.brandTitle) meta.brandTitle = patch.brandTitle;
      else delete meta.brandTitle;
    }
    await tx
      .update(organizations)
      .set({ metadata: JSON.stringify(meta), ...(patch.logo !== undefined ? { logo: patch.logo } : {}) })
      .where(eq(organizations.id, organizationId));
  });
}

// ── Custom areas ───────────────────────────────────────────────────────

export type AreaRow = {
  id: string;
  name: string;
  mode: "lga_set" | "polygon";
  lgaIds: number[] | null;
  polygonGeojson: unknown;
  createdAt: Date;
};

export async function listAreas(organizationId: string): Promise<AreaRow[]> {
  return db
    .select({
      id: customAreas.id,
      name: customAreas.name,
      mode: customAreas.mode,
      lgaIds: customAreas.lgaIds,
      polygonGeojson: customAreas.polygonGeojson,
      createdAt: customAreas.createdAt,
    })
    .from(customAreas)
    .where(eq(customAreas.organizationId, organizationId))
    .orderBy(asc(customAreas.createdAt));
}

export async function getArea(organizationId: string, areaId: string): Promise<AreaRow | null> {
  const [a] = await db
    .select({
      id: customAreas.id,
      name: customAreas.name,
      mode: customAreas.mode,
      lgaIds: customAreas.lgaIds,
      polygonGeojson: customAreas.polygonGeojson,
      createdAt: customAreas.createdAt,
    })
    .from(customAreas)
    .where(and(eq(customAreas.id, areaId), eq(customAreas.organizationId, organizationId)))
    .limit(1);
  return a ?? null;
}

export async function countAreas(organizationId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(customAreas).where(eq(customAreas.organizationId, organizationId));
  return Number(r?.n ?? 0);
}

/** LGA set: geom = union of the member LGA geometries (PostGIS). */
export async function insertLgaSetArea(input: {
  id: string;
  organizationId: string;
  name: string;
  lgaIds: number[];
  createdBy: string;
}): Promise<void> {
  await db.execute(sql`
    insert into custom_areas (id, organization_id, name, mode, lga_ids, geom, created_by)
    select ${input.id}, ${input.organizationId}, ${input.name}, 'lga_set',
           ${sql.raw(`ARRAY[${input.lgaIds.map((n) => Math.trunc(n)).join(",")}]::int[]`)},
           ST_Multi(ST_Union(l.geom)), ${input.createdBy}
    from lgas l where l.id = any(${sql.raw(`ARRAY[${input.lgaIds.map((n) => Math.trunc(n)).join(",")}]::int[]`)})`);
}

/** PostGIS topological check (self-intersections etc.) — run before insert. */
export async function checkGeometryValid(g: MultiPolygonGeometry): Promise<{ valid: boolean; reason: string }> {
  const res = await db.execute<{ valid: boolean; reason: string }>(sql`
    select ST_IsValid(g) as valid, ST_IsValidReason(g) as reason
    from (select ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}), 4326) as g) t`);
  const r = res.rows[0];
  return { valid: !!r?.valid, reason: r?.reason ?? "unknown" };
}

export async function insertPolygonArea(input: {
  id: string;
  organizationId: string;
  name: string;
  geometry: MultiPolygonGeometry;
  createdBy: string;
}): Promise<void> {
  const json = JSON.stringify(input.geometry);
  await db.execute(sql`
    insert into custom_areas (id, organization_id, name, mode, polygon_geojson, geom, created_by)
    values (${input.id}, ${input.organizationId}, ${input.name}, 'polygon', ${json}::jsonb,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${json}), 4326)), ${input.createdBy})`);
}

export async function deleteArea(organizationId: string, areaId: string): Promise<boolean> {
  const r = await db
    .delete(customAreas)
    .where(and(eq(customAreas.id, areaId), eq(customAreas.organizationId, organizationId)))
    .returning({ id: customAreas.id });
  return r.length > 0;
}

export async function areaInUseByReports(organizationId: string, areaId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.customAreaId, areaId), eq(reports.organizationId, organizationId)))
    .limit(1);
  return !!r;
}

/** Every LGA with its state, for the grouped multi-select (774 rows, small). */
export async function listLgaOptions(): Promise<{ id: number; name: string; stateName: string }[]> {
  return db
    .select({ id: lgas.id, name: lgas.name, stateName: states.name })
    .from(lgas)
    .innerJoin(states, eq(states.id, lgas.stateId))
    .orderBy(asc(states.name), asc(lgas.name));
}

export async function countExistingLgas(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const [r] = await db.select({ n: count() }).from(lgas).where(inArray(lgas.id, ids));
  return Number(r?.n ?? 0);
}

export async function lgaBoundaries(ids: number[]): Promise<{ id: number; name: string; geojson: unknown }[]> {
  if (!ids.length) return [];
  return db
    .select({ id: lgas.id, name: lgas.name, geojson: lgas.boundaryGeojson })
    .from(lgas)
    .where(inArray(lgas.id, ids));
}

// ── Branded reports ────────────────────────────────────────────────────

export async function listOrgReports(organizationId: string) {
  return db
    .select({
      id: reports.id,
      type: reports.type,
      scopeType: reports.scopeType,
      scopeKey: reports.scopeKey,
      areaName: customAreas.name,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      status: reports.status,
      pdfKey: reports.pdfKey,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .leftJoin(customAreas, eq(customAreas.id, reports.customAreaId))
    .where(eq(reports.organizationId, organizationId))
    .orderBy(desc(reports.periodStart), desc(reports.updatedAt))
    .limit(50);
}

export async function getOrgReportPdf(organizationId: string, reportId: string) {
  const [r] = await db
    .select({ pdfKey: reports.pdfKey, type: reports.type, periodStart: reports.periodStart })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, organizationId)))
    .limit(1);
  return r?.pdfKey ? { pdfKey: r.pdfKey, type: r.type, periodStart: r.periodStart } : null;
}

// ── API keys + usage ───────────────────────────────────────────────────

export async function listApiKeys(organizationId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function countActiveKeys(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt)));
  return Number(r?.n ?? 0);
}

export async function insertApiKey(input: {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  createdBy: string;
}): Promise<void> {
  await db.insert(apiKeys).values(input);
}

export async function revokeApiKey(organizationId: string, keyId: string): Promise<boolean> {
  const r = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return r.length > 0;
}

/** Daily call totals across the org's keys for [from, to] (YYYY-MM-DD), keyed by day. */
export async function usageByDay(organizationId: string, from: string, to: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ day: apiUsage.day, n: sql<number>`sum(${apiUsage.count})::int` })
    .from(apiUsage)
    .innerJoin(apiKeys, eq(apiKeys.id, apiUsage.apiKeyId))
    .where(and(eq(apiKeys.organizationId, organizationId), gte(apiUsage.day, from), lte(apiUsage.day, to)))
    .groupBy(apiUsage.day);
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

/** Per-key totals for the period (for the key table). */
export async function usageByKey(organizationId: string, from: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ keyId: apiUsage.apiKeyId, n: sql<number>`sum(${apiUsage.count})::int` })
    .from(apiUsage)
    .innerJoin(apiKeys, eq(apiKeys.id, apiUsage.apiKeyId))
    .where(and(eq(apiKeys.organizationId, organizationId), gte(apiUsage.day, from)))
    .groupBy(apiUsage.apiKeyId);
  return new Map(rows.map((r) => [r.keyId, Number(r.n)]));
}

// ── Downloads ──────────────────────────────────────────────────────────

export type AreaCell = { gridCellId: number; label: string; lat: number; lon: number };

/**
 * Grid cells covering an area. lga_set → each LGA's centre cell (labelled
 * by LGA). polygon → active cells whose centre lies inside the polygon,
 * falling back to the centre cells of intersecting LGAs for small shapes.
 */
export async function areaCells(organizationId: string, areaId: string): Promise<AreaCell[]> {
  const area = await getArea(organizationId, areaId);
  if (!area) return [];
  if (area.mode === "lga_set") {
    const ids = area.lgaIds ?? [];
    if (!ids.length) return [];
    const rows = await db
      .select({ gridCellId: lgas.gridCellId, name: lgas.name, stateName: states.name, lat: gridCells.centreLat, lon: gridCells.centreLon })
      .from(lgas)
      .innerJoin(states, eq(states.id, lgas.stateId))
      .innerJoin(gridCells, eq(gridCells.id, lgas.gridCellId))
      .where(inArray(lgas.id, ids))
      .orderBy(asc(lgas.name));
    return rows.map((r) => ({ gridCellId: r.gridCellId!, label: `${r.name} (${r.stateName})`, lat: r.lat, lon: r.lon }));
  }
  const inside = await db.execute<{ id: number; lat: number; lon: number }>(sql`
    select g.id, g.centre_lat as lat, g.centre_lon as lon
    from grid_cells g, custom_areas a
    where a.id = ${areaId} and a.organization_id = ${organizationId}
      and g.active
      and ST_Contains(a.geom, ST_SetSRID(ST_MakePoint(g.centre_lon, g.centre_lat), 4326))
    order by g.centre_lat desc, g.centre_lon
    limit 400`);
  if (inside.rows.length) {
    return inside.rows.map((r) => ({ gridCellId: r.id, label: `cell ${r.lat.toFixed(2)},${r.lon.toFixed(2)}`, lat: r.lat, lon: r.lon }));
  }
  const fallback = await db.execute<{ id: number; lat: number; lon: number; name: string }>(sql`
    select g.id, g.centre_lat as lat, g.centre_lon as lon, l.name
    from lgas l
    join grid_cells g on g.id = l.grid_cell_id
    join custom_areas a on a.id = ${areaId} and a.organization_id = ${organizationId}
    where ST_Intersects(l.geom, a.geom)
    order by l.name
    limit 100`);
  return fallback.rows.map((r) => ({ gridCellId: r.id, label: r.name, lat: r.lat, lon: r.lon }));
}

export async function observedForCells(cellIds: number[], from: string, to: string) {
  if (!cellIds.length) return [];
  return db
    .select({
      gridCellId: observedDaily.gridCellId,
      date: observedDaily.date,
      rainMm: observedDaily.rainMm,
      tmaxC: observedDaily.tmaxC,
      tminC: observedDaily.tminC,
      humidityPct: observedDaily.humidityPct,
      windKmh: observedDaily.windKmh,
      source: observedDaily.source,
      preliminary: observedDaily.preliminary,
    })
    .from(observedDaily)
    .where(and(inArray(observedDaily.gridCellId, cellIds), gte(observedDaily.date, from), lte(observedDaily.date, to)))
    .orderBy(asc(observedDaily.date), asc(observedDaily.gridCellId));
}

export async function forecastForCells(cellIds: number[], from: string) {
  if (!cellIds.length) return [];
  return db
    .select({
      gridCellId: forecastDaily.gridCellId,
      date: forecastDaily.date,
      rainMm: forecastDaily.rainMm,
      rainProbPct: forecastDaily.rainProbPct,
      tmaxC: forecastDaily.tmaxC,
      tminC: forecastDaily.tminC,
      windMaxKmh: forecastDaily.windMaxKmh,
      source: forecastDaily.source,
      fetchedAt: forecastDaily.fetchedAt,
    })
    .from(forecastDaily)
    .where(and(inArray(forecastDaily.gridCellId, cellIds), gte(forecastDaily.date, from)))
    .orderBy(asc(forecastDaily.date), asc(forecastDaily.gridCellId));
}
