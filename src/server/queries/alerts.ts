import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { alertRules, alerts, lgas, notices, states } from "@/db/schema";

/**
 * Public alerts page + about-page queries (A4). Advisories are automatic and
 * NOT official warnings — every consumer labels them as such.
 */

export type PublicAlert = {
  id: string;
  type: "heavy_rain" | "heat" | "wind" | "dry_spell";
  severity: "moderate" | "high";
  validFrom: Date;
  validTo: Date;
  text: string;
  createdAt: Date;
  lgaId: number;
  lgaName: string;
  lgaSlug: string;
  stateId: number;
  stateName: string;
  stateSlug: string;
};

/** Alerts whose window has not ended yet, ordered state → LGA → start. */
export async function listActiveAlerts(now: Date): Promise<PublicAlert[]> {
  return db
    .select({
      id: alerts.id,
      type: alerts.type,
      severity: alerts.severity,
      validFrom: alerts.validFrom,
      validTo: alerts.validTo,
      text: alerts.text,
      createdAt: alerts.createdAt,
      lgaId: lgas.id,
      lgaName: lgas.name,
      lgaSlug: lgas.slug,
      stateId: states.id,
      stateName: states.name,
      stateSlug: states.slug,
    })
    .from(alerts)
    .innerJoin(lgas, eq(lgas.id, alerts.lgaId))
    .innerJoin(states, eq(states.id, lgas.stateId))
    .where(gt(alerts.validTo, now))
    .orderBy(asc(states.name), asc(lgas.name), asc(alerts.validFrom));
}

export type PublicNotice = { id: string; title: string; body: string; scope: string; createdAt: Date };

/** Active, unexpired editor notices for the given scopes (e.g. ['global','alerts']). */
export async function listNotices(scopes: string[], now: Date): Promise<PublicNotice[]> {
  if (!scopes.length) return [];
  return db
    .select({
      id: notices.id,
      title: notices.title,
      body: notices.body,
      scope: notices.scope,
      createdAt: notices.createdAt,
    })
    .from(notices)
    .where(
      and(
        eq(notices.active, true),
        inArray(notices.scope, scopes),
        or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
      ),
    )
    .orderBy(desc(notices.createdAt))
    .limit(10);
}

export type PublicAlertRule = {
  id: string;
  type: "heavy_rain" | "heat" | "wind" | "dry_spell";
  threshold: number;
  severity: "moderate" | "high";
  enabled: boolean;
  updatedAt: Date;
};

/** Live alert thresholds (editor-tunable) for the About page. */
export async function listAlertRules(): Promise<PublicAlertRule[]> {
  return db
    .select({
      id: alertRules.id,
      type: alertRules.type,
      threshold: alertRules.threshold,
      severity: alertRules.severity,
      enabled: alertRules.enabled,
      updatedAt: alertRules.updatedAt,
    })
    .from(alertRules)
    .orderBy(asc(alertRules.type), asc(alertRules.threshold));
}
