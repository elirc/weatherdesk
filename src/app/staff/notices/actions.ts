"use server";

import { z } from "zod";
import { actionError, requireEditor, type ActionResult } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { writeAudit } from "@/lib/ops";
import { getNotice, insertNotice, updateNotice } from "@/server/queries/staff";
import { parseInput } from "../_lib/action-utils";
import { lagosDateInputToExpiry, noticeInputSchema } from "../_lib/policy";

type NoticeInput = { title: string; body: string; scope: string; active: boolean; expiresOn?: string };

export async function createNoticeAction(input: NoticeInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireEditor();
    const p = parseInput(noticeInputSchema, input);
    if (!p.ok) return p;
    const id = newId();
    const expiresAt = lagosDateInputToExpiry(p.data.expiresOn);
    if (expiresAt && expiresAt.getTime() <= Date.now()) return { ok: false, error: "Expiry date is in the past" };
    await insertNotice({ id, title: p.data.title, body: p.data.body, scope: p.data.scope, active: p.data.active, expiresAt, createdBy: user.id });
    await writeAudit({
      actorUserId: user.id,
      action: "notice.create",
      entity: "notice",
      entityId: id,
      details: { title: p.data.title, scope: p.data.scope, active: p.data.active, expiresAt: expiresAt?.toISOString() ?? null },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateNoticeAction(input: NoticeInput & { id: string }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(noticeInputSchema.extend({ id: z.string().min(1).max(64) }), input);
    if (!p.ok) return p;
    const existing = await getNotice(p.data.id);
    if (!existing) return { ok: false, error: "Notice not found" };
    const expiresAt = lagosDateInputToExpiry(p.data.expiresOn);
    await updateNotice(p.data.id, { title: p.data.title, body: p.data.body, scope: p.data.scope, active: p.data.active, expiresAt });
    await writeAudit({
      actorUserId: user.id,
      action: existing.active && !p.data.active ? "notice.deactivate" : "notice.update",
      entity: "notice",
      entityId: p.data.id,
      details: { title: p.data.title, scope: p.data.scope, active: p.data.active, expiresAt: expiresAt?.toISOString() ?? null },
    });
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function setNoticeActiveAction(input: { id: string; active: boolean }): Promise<ActionResult> {
  try {
    const user = await requireEditor();
    const p = parseInput(z.object({ id: z.string().min(1).max(64), active: z.boolean() }), input);
    if (!p.ok) return p;
    const existing = await getNotice(p.data.id);
    if (!existing) return { ok: false, error: "Notice not found" };
    if (existing.active === p.data.active) return { ok: false, error: p.data.active ? "Already active" : "Already inactive" };
    await updateNotice(p.data.id, { active: p.data.active });
    await writeAudit({
      actorUserId: user.id,
      action: p.data.active ? "notice.activate" : "notice.deactivate",
      entity: "notice",
      entityId: p.data.id,
      details: { title: existing.title },
    });
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
