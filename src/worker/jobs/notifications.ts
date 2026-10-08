import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { getEmailAdapter, getSmsAdapter } from "@/adapters";
import { env } from "@/lib/env";
import { parsePayload, renderEmailHtml } from "../core/messages";
import { errMessage, log } from "../log";

/**
 * notification.send — load the row, render, deliver by channel, mark
 * sent/failed. Already-sent rows are skipped (safe under pg-boss retries).
 * On failure the row is marked 'failed' and the error rethrown so pg-boss
 * retries; a later successful attempt flips it to 'sent'.
 */
export async function notificationSend(data: { notificationId: string }) {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, data.notificationId)).limit(1);
  if (!n) {
    log.warn("notification.send: row not found", data);
    return { skipped: "missing" };
  }
  if (n.status === "sent") return { skipped: "already_sent" };

  try {
    const payload = parsePayload(n.payload);
    const [user] = await db
      .select({ email: users.email, phone: users.phoneNumber })
      .from(users)
      .where(eq(users.id, n.userId))
      .limit(1);
    let providerId: string;
    if (n.channel === "email") {
      const to = payload.to ?? user?.email;
      if (!to) throw new Error(`no email address for user ${n.userId}`);
      const subject = payload.subject ?? "WeatherDesk";
      const res = await getEmailAdapter().send({
        to,
        subject,
        text: payload.text,
        html: payload.html ?? renderEmailHtml(subject, payload.text, env.APP_URL),
      });
      providerId = res.id;
    } else if (n.channel === "sms" || n.channel === "whatsapp") {
      const to = payload.to ?? user?.phone ?? undefined;
      if (!to) throw new Error(`no phone number for user ${n.userId}`);
      const res = await getSmsAdapter().send({ to, body: payload.text, channel: n.channel });
      providerId = res.id;
    } else {
      throw new Error(`unknown channel '${n.channel}'`);
    }
    await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, n.id));
    return { sent: true, channel: n.channel, providerId };
  } catch (e) {
    await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, n.id));
    log.warn("notification.send failed", { id: n.id, channel: n.channel, error: errMessage(e) });
    throw e;
  }
}
