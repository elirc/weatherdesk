import { and, eq, gt, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  alertRules,
  alerts,
  forecastDaily,
  lgas,
  normalsSeason,
  notifications,
  observedDaily,
  savedPlaces,
} from "@/db/schema";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { JOBS, sendJob } from "@/lib/queue";
import { addDaysIso, lagosMidnightUtc } from "@/lib/time";
import {
  ALERT_FORECAST_DAYS,
  DRY_SPELL_OBSERVED_DAYS,
  dedupeAgainstExisting,
  evaluateAlerts,
  type AlertCandidate,
  type AlertRuleLite,
  type CellInputs,
} from "../core/alerts";
import { chunk } from "../core/chunk";
import { alertEmail } from "../core/messages";
import { log } from "../log";

/**
 * (d) Alert evaluation DB shell: load inputs → evaluateAlerts (pure) →
 * dedupe against overlapping existing alerts → insert → queue one email
 * notification per user (saved place with alertsEnabled in that LGA) + alert.
 */
export async function evaluateAndIssueAlerts(today: string): Promise<{ candidates: number; created: number; notifications: number }> {
  const rules = (await db.select().from(alertRules).where(eq(alertRules.enabled, true))) as AlertRuleLite[];
  if (!rules.length) return { candidates: 0, created: 0, notifications: 0 };

  const lgaRows = await db
    .select({ id: lgas.id, name: lgas.name, gridCellId: lgas.gridCellId })
    .from(lgas)
    .where(isNotNull(lgas.gridCellId));
  const cellIds = [...new Set(lgaRows.map((l) => l.gridCellId as number))];
  if (!cellIds.length) return { candidates: 0, created: 0, notifications: 0 };

  const horizonEnd = addDaysIso(today, ALERT_FORECAST_DAYS - 1);
  const obsStart = addDaysIso(today, -DRY_SPELL_OBSERVED_DAYS);
  const obsEnd = addDaysIso(today, -1);
  const cells = new Map<number, CellInputs>();
  const cellOf = (id: number) => {
    let c = cells.get(id);
    if (!c) {
      c = { forecast: [], observed: [], season: null };
      cells.set(id, c);
    }
    return c;
  };

  for (const ids of chunk(cellIds, 1000)) {
    const fc = await db
      .select({
        gridCellId: forecastDaily.gridCellId,
        date: forecastDaily.date,
        rainMm: forecastDaily.rainMm,
        tmaxC: forecastDaily.tmaxC,
        gustsMaxKmh: forecastDaily.gustsMaxKmh,
      })
      .from(forecastDaily)
      .where(and(inArray(forecastDaily.gridCellId, ids), gte(forecastDaily.date, today), lte(forecastDaily.date, horizonEnd)));
    for (const r of fc) cellOf(r.gridCellId).forecast.push(r);

    const obs = await db
      .select({ gridCellId: observedDaily.gridCellId, date: observedDaily.date, rainMm: observedDaily.rainMm })
      .from(observedDaily)
      .where(and(inArray(observedDaily.gridCellId, ids), gte(observedDaily.date, obsStart), lte(observedDaily.date, obsEnd)))
      .orderBy(observedDaily.gridCellId, observedDaily.date);
    for (const r of obs) cellOf(r.gridCellId).observed.push({ date: r.date, rainMm: r.rainMm });

    const seasons = await db.select().from(normalsSeason).where(inArray(normalsSeason.gridCellId, ids));
    for (const s of seasons) cellOf(s.gridCellId).season = { onsetDoy: s.onsetDoy, cessationDoy: s.cessationDoy };
  }

  const candidates = evaluateAlerts({ today, rules, lgas: lgaRows, cells });
  if (!candidates.length) return { candidates: 0, created: 0, notifications: 0 };

  const existing = await db
    .select({ lgaId: alerts.lgaId, type: alerts.type, validFrom: alerts.validFrom, validTo: alerts.validTo })
    .from(alerts)
    .where(gt(alerts.validTo, lagosMidnightUtc(today)));
  const fresh = dedupeAgainstExisting(candidates, existing);

  const created: (AlertCandidate & { id: string })[] = fresh.map((c) => ({ ...c, id: newId() }));
  for (const part of chunk(created, 500)) {
    await db.insert(alerts).values(
      part.map((c) => ({
        id: c.id,
        lgaId: c.lgaId,
        ruleId: c.ruleId,
        type: c.type,
        severity: c.severity,
        validFrom: c.validFrom,
        validTo: c.validTo,
        text: c.text,
      })),
    );
  }

  const nSent = await queueAlertNotifications(created, new Map(lgaRows.map((l) => [l.id, l.name])));
  log.info("alerts evaluated", { candidates: candidates.length, created: created.length, notifications: nSent });
  return { candidates: candidates.length, created: created.length, notifications: nSent };
}

async function queueAlertNotifications(
  created: (AlertCandidate & { id: string })[],
  lgaNames: Map<number, string>,
): Promise<number> {
  if (!created.length) return 0;
  const lgaIds = [...new Set(created.map((c) => c.lgaId))];
  const subscribers = new Map<number, Set<string>>();
  for (const ids of chunk(lgaIds, 1000)) {
    const rows = await db
      .select({ userId: savedPlaces.userId, lgaId: savedPlaces.lgaId })
      .from(savedPlaces)
      .where(and(inArray(savedPlaces.lgaId, ids), eq(savedPlaces.alertsEnabled, true)));
    for (const r of rows) {
      if (r.lgaId == null) continue;
      let s = subscribers.get(r.lgaId);
      if (!s) {
        s = new Set();
        subscribers.set(r.lgaId, s);
      }
      s.add(r.userId);
    }
  }
  let n = 0;
  for (const alert of created) {
    const users = subscribers.get(alert.lgaId);
    if (!users?.size) continue;
    const lgaName = lgaNames.get(alert.lgaId) ?? "your area";
    const msg = alertEmail({ lgaName, type: alert.type, text: alert.text, appUrl: env.APP_URL });
    for (const userId of users) {
      const id = newId();
      await db.insert(notifications).values({
        id,
        userId,
        kind: "alert",
        channel: "email",
        payload: { alertId: alert.id, lgaId: alert.lgaId, subject: msg.subject, text: msg.text },
      });
      await sendJob(JOBS.notificationSend, { notificationId: id }, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
      n += 1;
    }
  }
  return n;
}
