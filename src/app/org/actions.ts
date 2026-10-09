"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { actionError, requireUser, type ActionResult } from "@/lib/authz";
import { slugifyOrgName } from "@/lib/api/misc";

/**
 * /org top-level actions: create an organisation and accept an invitation.
 * Both go through the Better Auth organization plugin (server API) after
 * requireUser + Zod, so membership rows are written by the plugin itself.
 */

const createSchema = z.object({ name: z.string().trim().min(2).max(80) });

export async function createOrgAction(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const v = createSchema.parse(input);
    const slug = slugifyOrgName(v.name, randomBytes(2).toString("hex"));
    const org = await auth.api.createOrganization({ body: { name: v.name, slug }, headers: await headers() });
    if (!org) return { ok: false, error: "Could not create the organisation." };
    return { ok: true, data: { id: org.id } };
  } catch (e) {
    if (e instanceof Error && e.name === "APIError") return { ok: false, error: e.message || "Could not create the organisation." };
    return actionError(e);
  }
}

export async function acceptInvitationAction(input: { invitationId: string }): Promise<ActionResult<{ organizationId: string }>> {
  try {
    await requireUser();
    const v = z.object({ invitationId: z.string().min(8).max(64) }).parse(input);
    const res = await auth.api.acceptInvitation({ body: { invitationId: v.invitationId }, headers: await headers() });
    const orgId = res?.member?.organizationId;
    if (!orgId) return { ok: false, error: "Invitation could not be accepted." };
    return { ok: true, data: { organizationId: orgId } };
  } catch (e) {
    if (e instanceof Error && e.name === "APIError") return { ok: false, error: e.message || "Invitation could not be accepted." };
    return actionError(e);
  }
}
