import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dailySendSubscriptions, forecastDaily, notifications, savedPlaces } from "@/db/schema";
import { newId } from "@/lib/ids";
import { JOBS, sendJob } from "@/lib/queue";
import { lagosMidnightUtc, lagosToday } from "@/lib/time";
import { dailyForecastText } from "../core/messages";
import { inQuarterHourWindow, lagosMinuteOfDay } from "../core/periods";
import { log } from "../log";

/**
 * daily-send.tick (every 15 min) — active SMS/WhatsApp daily-forecast
 * subscriptions whose sendTimeLocal falls in the current Lagos quarter hour
 * get today's forecast for their saved place. Idempotent per
 * subscription + day (a re-run in the same window does not double-send).
 */
export async function dailySendTick(now = new Date()) {
  const minute = lagosMinuteOfDay(now);
  const today = lagosToday();
  const subs = (await db.select().from(dailySendSubscriptions).where(eq(dailySendSubscriptions.active, true))).filter(
    (s) => inQuarterHourWindow(s.sendTimeLocal, minute),
  );
  if (!subs.length) return { due: 0, queued: 0 };

  const places = await db
    .select()
    .from(savedPlaces)
    .where(inArray(savedPlaces.id, subs.map((s) => s.savedPlaceId)));
  const placeById = new Map(places.map((p) => [p.id, p]));
  const cellIds = [...new Set(places.map((p) => p.gridCellId))];
  const fc = cellIds.length
    ? await db
        .select()
        .from(forecastDaily)
        .where(and(inArray(forecastDaily.gridCellId, cellIds), eq(forecastDaily.date, today)))
    : [];
  const fcByCell = new Map(fc.map((f) => [f.gridCellId, f]));

  // already-sent today (idempotency)
  const userIds = [...new Set(subs.map((s) => s.userId))];
  const sentToday = await db
    .select({ payload: notifications.payload })
    .from(notifications)
    .where(
      and(
        inArray(notifications.userId, userIds),
        eq(notifications.kind, "daily_forecast"),
        gte(notifications.createdAt, lagosMidnightUtc(today)),
      ),
    );
  const done = new Set(
    sentToday.map((r) => (r.payload as { subscriptionId?: string } | null)?.subscriptionId).filter(Boolean),
  );

  let queued = 0;
  for (const s of subs) {
    if (done.has(s.id)) continue;
    const place = placeById.get(s.savedPlaceId);
    const day = place ? fcByCell.get(place.gridCellId) : undefined;
    if (!place || !day) {
      log.warn("daily-send: no place/forecast for subscription — skipped", { subscriptionId: s.id });
      continue;
    }
    const text = dailyForecastText(place.name, day);
    const id = newId();
    await db.insert(notifications).values({
      id,
      userId: s.userId,
      kind: "daily_forecast",
      channel: s.channel === "whatsapp" ? "whatsapp" : "sms",
      payload: { subscriptionId: s.id, date: today, to: s.phone, text },
    });
    await sendJob(JOBS.notificationSend, { notificationId: id }, { retryLimit: 3, retryDelay: 60, retryBackoff: true });
    queued += 1;
  }
  log.info("daily-send tick", { due: subs.length, queued });
  return { due: subs.length, queued };
}
