import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dailySendSubscriptions,
  forecastDaily,
  lgas,
  notifications,
  reportSubscriptions,
  savedPlaces,
  settlements,
  states,
  users,
} from "@/db/schema";
import { lagosToday } from "@/lib/time";

/**
 * Personal account queries (A6): saved places, report subscriptions, the
 * daily SMS/WhatsApp add-on, notifications. Every query is scoped by userId
 * in the WHERE clause itself.
 */

export const MAX_SAVED_PLACES = 25;

export type SavedPlaceView = {
  id: string;
  name: string;
  kind: "state" | "lga" | "settlement" | "point";
  lat: number;
  lon: number;
  alertsEnabled: boolean;
  href: string;
  context: string | null;
  today: {
    tmaxC: number | null;
    tminC: number | null;
    rainMm: number | null;
    rainProbPct: number | null;
    source: string;
    fetchedAt: Date;
  } | null;
};

export async function listSavedPlaces(userId: string): Promise<SavedPlaceView[]> {
  const today = lagosToday();
  const rows = await db
    .select({
      id: savedPlaces.id,
      name: savedPlaces.name,
      kind: savedPlaces.kind,
      lat: savedPlaces.lat,
      lon: savedPlaces.lon,
      alertsEnabled: savedPlaces.alertsEnabled,
      settlementId: savedPlaces.settlementId,
      lgaSlug: lgas.slug,
      lgaName: lgas.name,
      stateSlug: states.slug,
      stateName: states.name,
      tmaxC: forecastDaily.tmaxC,
      tminC: forecastDaily.tminC,
      rainMm: forecastDaily.rainMm,
      rainProbPct: forecastDaily.rainProbPct,
      source: forecastDaily.source,
      fetchedAt: forecastDaily.fetchedAt,
    })
    .from(savedPlaces)
    .leftJoin(lgas, eq(lgas.id, savedPlaces.lgaId))
    .leftJoin(states, eq(states.id, savedPlaces.stateId))
    .leftJoin(
      forecastDaily,
      and(eq(forecastDaily.gridCellId, savedPlaces.gridCellId), eq(forecastDaily.date, today)),
    )
    .where(eq(savedPlaces.userId, userId))
    .orderBy(asc(savedPlaces.createdAt));
  return rows.map((r) => {
    const href =
      r.kind === "state" && r.stateSlug
        ? `/place/state/${r.stateSlug}`
        : r.kind === "lga" && r.lgaSlug
          ? `/place/lga/${r.lgaSlug}`
          : r.kind === "settlement" && r.settlementId
            ? `/place/settlement/${r.settlementId}`
            : `/place/point?lat=${r.lat.toFixed(4)}&lon=${r.lon.toFixed(4)}`;
    const context =
      r.kind === "state" ? "State" : r.lgaName ? `${r.lgaName} LGA${r.stateName ? `, ${r.stateName}` : ""}` : (r.stateName ?? null);
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      lat: r.lat,
      lon: r.lon,
      alertsEnabled: r.alertsEnabled,
      href,
      context,
      today:
        r.source && r.fetchedAt
          ? { tmaxC: r.tmaxC, tminC: r.tminC, rainMm: r.rainMm, rainProbPct: r.rainProbPct, source: r.source, fetchedAt: r.fetchedAt }
          : null,
    };
  });
}

export async function countSavedPlaces(userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(savedPlaces).where(eq(savedPlaces.userId, userId));
  return Number(r?.n ?? 0);
}

export type PlaceTarget = {
  name: string;
  kind: "state" | "lga" | "settlement" | "point";
  lat: number;
  lon: number;
  stateId: number | null;
  lgaId: number | null;
  settlementId: number | null;
};

/** Resolve a search hit (kind + id) to coordinates and geography ids for saving. */
export async function resolvePlaceTarget(kind: "state" | "lga" | "settlement", id: number): Promise<PlaceTarget | null> {
  if (kind === "state") {
    const [s] = await db
      .select({ id: states.id, name: states.name, lat: states.centreLat, lon: states.centreLon })
      .from(states)
      .where(eq(states.id, id))
      .limit(1);
    return s ? { name: s.name, kind, lat: s.lat, lon: s.lon, stateId: s.id, lgaId: null, settlementId: null } : null;
  }
  if (kind === "lga") {
    const [l] = await db
      .select({ id: lgas.id, name: lgas.name, lat: lgas.centreLat, lon: lgas.centreLon, stateId: lgas.stateId })
      .from(lgas)
      .where(eq(lgas.id, id))
      .limit(1);
    return l ? { name: l.name, kind, lat: l.lat, lon: l.lon, stateId: l.stateId, lgaId: l.id, settlementId: null } : null;
  }
  const [t] = await db
    .select({
      id: settlements.id,
      name: settlements.name,
      lat: settlements.lat,
      lon: settlements.lon,
      lgaId: settlements.lgaId,
      stateId: lgas.stateId,
    })
    .from(settlements)
    .innerJoin(lgas, eq(lgas.id, settlements.lgaId))
    .where(eq(settlements.id, id))
    .limit(1);
  return t ? { name: t.name, kind, lat: t.lat, lon: t.lon, stateId: t.stateId, lgaId: t.lgaId, settlementId: t.id } : null;
}

export async function insertSavedPlace(
  userId: string,
  id: string,
  target: PlaceTarget,
  gridCellId: number,
): Promise<void> {
  await db.insert(savedPlaces).values({
    id,
    userId,
    name: target.name,
    kind: target.kind,
    stateId: target.stateId,
    lgaId: target.lgaId,
    settlementId: target.settlementId,
    lat: target.lat,
    lon: target.lon,
    gridCellId,
    alertsEnabled: true,
  });
}

export async function setSavedPlaceAlerts(userId: string, id: string, enabled: boolean): Promise<boolean> {
  const r = await db
    .update(savedPlaces)
    .set({ alertsEnabled: enabled })
    .where(and(eq(savedPlaces.id, id), eq(savedPlaces.userId, userId)))
    .returning({ id: savedPlaces.id });
  return r.length > 0;
}

/** Deletes the place and any daily sends that pointed at it. */
export async function deleteSavedPlace(userId: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.id, id), eq(savedPlaces.userId, userId)))
      .returning({ id: savedPlaces.id });
    if (r.length) {
      await tx
        .delete(dailySendSubscriptions)
        .where(and(eq(dailySendSubscriptions.userId, userId), eq(dailySendSubscriptions.savedPlaceId, id)));
    }
    return r.length > 0;
  });
}

/** Same geography (or same ~100 m point) already saved by this user? */
export async function savedPlaceDuplicate(userId: string, t: PlaceTarget): Promise<boolean> {
  const cond =
    t.kind === "settlement" && t.settlementId
      ? eq(savedPlaces.settlementId, t.settlementId)
      : t.kind === "lga" && t.lgaId
        ? and(eq(savedPlaces.kind, "lga"), eq(savedPlaces.lgaId, t.lgaId))
        : t.kind === "state" && t.stateId
          ? and(eq(savedPlaces.kind, "state"), eq(savedPlaces.stateId, t.stateId))
          : and(
              eq(savedPlaces.kind, "point"),
              sql`abs(${savedPlaces.lat} - ${t.lat}) < 0.001 and abs(${savedPlaces.lon} - ${t.lon}) < 0.001`,
            );
  const [r] = await db
    .select({ id: savedPlaces.id })
    .from(savedPlaces)
    .where(and(eq(savedPlaces.userId, userId), cond))
    .limit(1);
  return !!r;
}

export async function savedPlaceOwned(userId: string, id: string): Promise<boolean> {
  const [r] = await db
    .select({ id: savedPlaces.id })
    .from(savedPlaces)
    .where(and(eq(savedPlaces.id, id), eq(savedPlaces.userId, userId)))
    .limit(1);
  return !!r;
}

// ── Report subscriptions ───────────────────────────────────────────────

export async function listReportSubscriptions(userId: string) {
  const rows = await db
    .select({
      id: reportSubscriptions.id,
      reportType: reportSubscriptions.reportType,
      scopeKey: reportSubscriptions.scopeKey,
      channel: reportSubscriptions.channel,
      createdAt: reportSubscriptions.createdAt,
    })
    .from(reportSubscriptions)
    .where(eq(reportSubscriptions.userId, userId))
    .orderBy(asc(reportSubscriptions.createdAt));
  const stateRows = await db.select({ id: states.id, name: states.name }).from(states);
  const names = new Map(stateRows.map((s) => [`state:${s.id}`, `${s.name} State`]));
  return rows.map((r) => ({ ...r, scopeName: r.scopeKey === "national" ? "Nigeria (national)" : (names.get(r.scopeKey) ?? r.scopeKey) }));
}

export async function insertReportSubscription(
  userId: string,
  id: string,
  reportType: "weekly" | "monthly",
  scopeKey: string,
): Promise<boolean> {
  const r = await db
    .insert(reportSubscriptions)
    .values({ id, userId, reportType, scopeKey, channel: "email" })
    .onConflictDoNothing()
    .returning({ id: reportSubscriptions.id });
  return r.length > 0;
}

export async function deleteReportSubscription(userId: string, id: string): Promise<boolean> {
  const r = await db
    .delete(reportSubscriptions)
    .where(and(eq(reportSubscriptions.id, id), eq(reportSubscriptions.userId, userId)))
    .returning({ id: reportSubscriptions.id });
  return r.length > 0;
}

export async function stateExists(stateId: number): Promise<boolean> {
  const [s] = await db.select({ id: states.id }).from(states).where(eq(states.id, stateId)).limit(1);
  return !!s;
}

// ── Daily SMS / WhatsApp add-on ────────────────────────────────────────

export async function listDailySends(userId: string) {
  return db
    .select({
      id: dailySendSubscriptions.id,
      channel: dailySendSubscriptions.channel,
      phone: dailySendSubscriptions.phone,
      sendTimeLocal: dailySendSubscriptions.sendTimeLocal,
      active: dailySendSubscriptions.active,
      placeName: savedPlaces.name,
      savedPlaceId: dailySendSubscriptions.savedPlaceId,
    })
    .from(dailySendSubscriptions)
    .leftJoin(savedPlaces, eq(savedPlaces.id, dailySendSubscriptions.savedPlaceId))
    .where(eq(dailySendSubscriptions.userId, userId))
    .orderBy(asc(dailySendSubscriptions.createdAt));
}

export async function countActiveDailySends(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(dailySendSubscriptions)
    .where(and(eq(dailySendSubscriptions.userId, userId), eq(dailySendSubscriptions.active, true)));
  return Number(r?.n ?? 0);
}

export async function insertDailySend(input: {
  id: string;
  userId: string;
  savedPlaceId: string;
  channel: "sms" | "whatsapp";
  phone: string;
  sendTimeLocal: string;
}): Promise<void> {
  await db.insert(dailySendSubscriptions).values({ ...input, active: true });
}

export async function setDailySendActive(userId: string, id: string, active: boolean): Promise<boolean> {
  const r = await db
    .update(dailySendSubscriptions)
    .set({ active })
    .where(and(eq(dailySendSubscriptions.id, id), eq(dailySendSubscriptions.userId, userId)))
    .returning({ id: dailySendSubscriptions.id });
  return r.length > 0;
}

export async function deleteDailySend(userId: string, id: string): Promise<boolean> {
  const r = await db
    .delete(dailySendSubscriptions)
    .where(and(eq(dailySendSubscriptions.id, id), eq(dailySendSubscriptions.userId, userId)))
    .returning({ id: dailySendSubscriptions.id });
  return r.length > 0;
}

export async function getUserPhone(userId: string): Promise<{ phone: string | null; verified: boolean }> {
  const [u] = await db
    .select({ phone: users.phoneNumber, verified: users.phoneNumberVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { phone: u?.phone ?? null, verified: !!u?.verified };
}

// ── Notifications ──────────────────────────────────────────────────────

export async function listNotifications(userId: string, limit = 50) {
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      channel: notifications.channel,
      payload: notifications.payload,
      status: notifications.status,
      sentAt: notifications.sentAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(50, Math.max(1, limit)));
}
