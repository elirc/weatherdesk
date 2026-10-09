import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { getEmailAdapter, getSmsAdapter, getStorageAdapter } from "@/adapters";
import { env } from "@/lib/env";
import { attachmentRef, buildEmailMessage, parsePayload, type NotificationPayload } from "../core/messages";
import { errMessage, log } from "../log";

/**
 * notification.send — load the row, render, deliver by channel, mark
 * sent/failed. Already-sent rows are skipped (safe under pg-boss retries).
 * On failure the row is marked 'failed' and the error rethrown so pg-boss
 * retries; a later successful attempt flips it to 'sent'.
 *
 * Email attachments (payload.attachment, set by A5 for PDFs < 2 MB) are read
 * from storage. A missing object or a storage error never fails the
 * notification: the email is sent without the attachment (its text already
 * links the PDF) and a warning is logged. Non-email channels ignore it.
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
    let attached = false;
    if (n.channel === "email") {
      const to = payload.to ?? user?.email;
      if (!to) throw new Error(`no email address for user ${n.userId}`);
      const file = await loadAttachment(payload, n.id);
      const msg = buildEmailMessage(payload, to, env.APP_URL, file);
      attached = Boolean(msg.attachments?.length);
      const res = await getEmailAdapter().send(msg);
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
    return { sent: true, channel: n.channel, providerId, attached };
  } catch (e) {
    await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, n.id));
    log.warn("notification.send failed", { id: n.id, channel: n.channel, error: errMessage(e) });
    throw e;
  }
}

/** Storage read for the payload's attachment; null (with a warning) when absent or unreadable. */
async function loadAttachment(
  payload: NotificationPayload,
  notificationId: string,
): Promise<{ content: Buffer; contentType: string } | null> {
  const ref = attachmentRef(payload);
  if (!ref) {
    if (payload.attachment != null) {
      log.warn("notification.send: malformed attachment ref — sending without it", { id: notificationId });
    }
    return null;
  }
  try {
    const file = await getStorageAdapter().get(ref.key);
    if (!file) {
      log.warn("notification.send: attachment not found in storage — sending without it", {
        id: notificationId,
        key: ref.key,
      });
    }
    return file;
  } catch (e) {
    log.warn("notification.send: attachment read failed — sending without it", {
      id: notificationId,
      key: ref.key,
      error: errMessage(e),
    });
    return null;
  }
}
