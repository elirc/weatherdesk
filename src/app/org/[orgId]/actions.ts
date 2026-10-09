"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStorageAdapter } from "@/adapters";
import { auth } from "@/lib/auth";
import { actionError, requireOrgMember, type ActionResult } from "@/lib/authz";
import { newApiKeyPlaintext, newId } from "@/lib/ids";
import { JOBS, sendJob } from "@/lib/queue";
import { lagosToday } from "@/lib/time";
import { startCheckout } from "@/lib/api/checkout";
import { validateAreaGeojson } from "@/lib/api/geojson";
import { apiKeyPrefix, hashApiKey } from "@/lib/api/keys";
import { assertWithinLimit, getOrgPlan, LimitError } from "@/lib/api/limits";
import { LOGO_MAX_BYTES, LOGO_TYPES, previousWeekMonday, sniffImageType } from "@/lib/api/misc";
import { outlinePath, type Outline } from "@/lib/api/outline";
import { env } from "@/lib/env";
import {
  areaInUseByReports,
  checkGeometryValid,
  countActiveKeys,
  countAreas,
  countExistingLgas,
  countSeats,
  deleteArea,
  getArea,
  getOrg,
  insertApiKey,
  insertLgaSetArea,
  insertPolygonArea,
  revokeApiKey,
  updateOrgBranding,
} from "@/server/queries/org";

/**
 * Organisation actions. Each starts with requireOrgMember(orgId, minRole),
 * parses with Zod, and passes organizationId into the scoped query.
 * Plan limits via src/lib/api/limits.ts.
 */

const orgId = z.string().min(8).max(64);
const MAX_ACTIVE_KEYS = 10;

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof LimitError) return { ok: false, error: e.message };
  if (e instanceof Error && e.name === "APIError") return { ok: false, error: e.message || "Request rejected" };
  return actionError(e);
}

// ── Team ───────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  organizationId: orgId,
  email: z.email().max(200),
  role: z.enum(["member", "admin"]),
});

export async function inviteMemberAction(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ invitationId: string; link: string }>> {
  try {
    const v = inviteSchema.parse(input);
    await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    assertWithinLimit("teamMembers", plan.limits, await countSeats(v.organizationId));
    const inv = await auth.api.createInvitation({
      body: { email: v.email.toLowerCase(), role: v.role, organizationId: v.organizationId },
      headers: await headers(),
    });
    const link = `${env.APP_URL.replace(/\/$/, "")}/org/accept-invite/${inv.id}`;
    // No invitation email is wired in the auth config — log the link (dev) and surface it in the UI.
    console.log(`[org-invite] ${v.email} -> ${link}`);
    revalidatePath(`/org/${v.organizationId}`);
    return { ok: true, data: { invitationId: inv.id, link } };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInvitationAction(input: { organizationId: string; invitationId: string }): Promise<ActionResult> {
  try {
    const v = z.object({ organizationId: orgId, invitationId: z.string().min(8).max(64) }).parse(input);
    await requireOrgMember(v.organizationId, "admin");
    await auth.api.cancelInvitation({ body: { invitationId: v.invitationId }, headers: await headers() });
    revalidatePath(`/org/${v.organizationId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMemberRoleAction(input: {
  organizationId: string;
  memberId: string;
  role: "member" | "admin";
}): Promise<ActionResult> {
  try {
    const v = z
      .object({ organizationId: orgId, memberId: z.string().min(8).max(64), role: z.enum(["member", "admin"]) })
      .parse(input);
    await requireOrgMember(v.organizationId, "owner");
    await auth.api.updateMemberRole({
      body: { memberId: v.memberId, role: v.role, organizationId: v.organizationId },
      headers: await headers(),
    });
    revalidatePath(`/org/${v.organizationId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMemberAction(input: { organizationId: string; memberId: string }): Promise<ActionResult> {
  try {
    const v = z.object({ organizationId: orgId, memberId: z.string().min(8).max(64) }).parse(input);
    await requireOrgMember(v.organizationId, "admin");
    await auth.api.removeMember({
      body: { memberIdOrEmail: v.memberId, organizationId: v.organizationId },
      headers: await headers(),
    });
    revalidatePath(`/org/${v.organizationId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Custom areas ───────────────────────────────────────────────────────

const areaName = z.string().trim().min(2).max(80);

const lgaAreaSchema = z.object({
  organizationId: orgId,
  name: areaName,
  lgaIds: z.array(z.number().int().positive()).min(1).max(200),
});

export async function createLgaAreaAction(input: z.input<typeof lgaAreaSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const v = lgaAreaSchema.parse(input);
    const { user } = await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    assertWithinLimit("customAreas", plan.limits, await countAreas(v.organizationId));
    const ids = [...new Set(v.lgaIds)];
    if ((await countExistingLgas(ids)) !== ids.length) return { ok: false, error: "Unknown LGA in selection." };
    const id = newId();
    await insertLgaSetArea({ id, organizationId: v.organizationId, name: v.name, lgaIds: ids, createdBy: user.id });
    revalidatePath(`/org/${v.organizationId}/areas`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

const polygonSchema = z.object({ organizationId: orgId, geojson: z.string().min(10).max(500_000) });

/** Validate + server-render an outline preview (d3-geo path) without saving. */
export async function previewPolygonAction(
  input: z.input<typeof polygonSchema>,
): Promise<ActionResult<{ outline: Outline; vertices: number }>> {
  try {
    const v = polygonSchema.parse(input);
    await requireOrgMember(v.organizationId, "admin");
    const g = validateAreaGeojson(v.geojson);
    if (!g.ok) return { ok: false, error: g.error };
    const topo = await checkGeometryValid(g.geometry);
    if (!topo.valid) return { ok: false, error: `Invalid shape: ${topo.reason}` };
    const outline = outlinePath([g.geometry], 320, 220);
    if (!outline) return { ok: false, error: "Could not draw the shape." };
    return { ok: true, data: { outline, vertices: g.vertices } };
  } catch (e) {
    return fail(e);
  }
}

export async function createPolygonAreaAction(
  input: z.input<typeof polygonSchema> & { name: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    const v = polygonSchema.extend({ name: areaName }).parse(input);
    const { user } = await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    assertWithinLimit("customAreas", plan.limits, await countAreas(v.organizationId));
    const g = validateAreaGeojson(v.geojson);
    if (!g.ok) return { ok: false, error: g.error };
    const topo = await checkGeometryValid(g.geometry);
    if (!topo.valid) return { ok: false, error: `Invalid shape: ${topo.reason}` };
    const id = newId();
    await insertPolygonArea({ id, organizationId: v.organizationId, name: v.name, geometry: g.geometry, createdBy: user.id });
    revalidatePath(`/org/${v.organizationId}/areas`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAreaAction(input: { organizationId: string; areaId: string }): Promise<ActionResult> {
  try {
    const v = z.object({ organizationId: orgId, areaId: z.string().uuid() }).parse(input);
    await requireOrgMember(v.organizationId, "admin");
    if (await areaInUseByReports(v.organizationId, v.areaId)) {
      return { ok: false, error: "This area has reports; it is kept so their history stays intact." };
    }
    if (!(await deleteArea(v.organizationId, v.areaId))) return { ok: false, error: "Area not found." };
    revalidatePath(`/org/${v.organizationId}/areas`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Branding + branded reports ─────────────────────────────────────────

export async function saveBrandingAction(formData: FormData): Promise<ActionResult> {
  try {
    const v = z
      .object({ organizationId: orgId, brandTitle: z.string().trim().max(80).optional() })
      .parse({ organizationId: formData.get("organizationId"), brandTitle: formData.get("brandTitle") ?? undefined });
    await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    assertWithinLimit("brandedReports", plan.limits);

    let logoKey: string | undefined;
    const file = formData.get("logo");
    if (file instanceof File && file.size > 0) {
      if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "Logo must be 500 KB or smaller." };
      const buf = Buffer.from(await file.arrayBuffer());
      const type = sniffImageType(buf);
      if (!type) return { ok: false, error: "Logo must be a PNG or JPEG image." };
      const org = await getOrg(v.organizationId);
      logoKey = `orgs/${v.organizationId}/logo-${Date.now()}.${LOGO_TYPES[type]}`;
      await getStorageAdapter().put(logoKey, buf, type);
      if (org?.logo && !/^https?:/i.test(org.logo)) await getStorageAdapter().delete(org.logo).catch(() => {});
    }
    await updateOrgBranding(v.organizationId, {
      brandTitle: v.brandTitle === undefined ? undefined : v.brandTitle || null,
      ...(logoKey ? { logo: logoKey } : {}),
    });
    revalidatePath(`/org/${v.organizationId}/reports`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const genSchema = z.object({
  organizationId: orgId,
  scopeKey: z.string().regex(/^(national|area:[0-9a-f-]{36})$/),
  type: z.enum(["weekly", "monthly"]),
});

/** Queue a branded report (report.generate job → PDF render). Last full week / previous month. */
export async function generateBrandedReportAction(input: z.input<typeof genSchema>): Promise<ActionResult> {
  try {
    const v = genSchema.parse(input);
    await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    assertWithinLimit("brandedReports", plan.limits);
    if (v.scopeKey.startsWith("area:") && !(await getArea(v.organizationId, v.scopeKey.slice(5)))) {
      return { ok: false, error: "Area not found." };
    }
    const today = lagosToday();
    const periodStart = v.type === "weekly" ? previousWeekMonday(today) : `${prevMonth(today)}-01`;
    await sendJob(
      JOBS.reportGenerate,
      {
        type: v.type,
        scopeKey: v.scopeKey,
        periodStart,
        organizationId: v.organizationId,
        ...(v.type === "monthly" ? { phase: "preliminary" as const } : {}),
      },
      { singletonKey: `branded:${v.organizationId}:${v.type}:${v.scopeKey}:${periodStart}`, retryLimit: 2 },
    );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function prevMonth(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

// ── API keys ───────────────────────────────────────────────────────────

export async function createApiKeyAction(input: {
  organizationId: string;
  name: string;
}): Promise<ActionResult<{ plaintext: string; prefix: string }>> {
  try {
    const v = z.object({ organizationId: orgId, name: z.string().trim().min(2).max(60) }).parse(input);
    const { user } = await requireOrgMember(v.organizationId, "admin");
    const plan = await getOrgPlan(v.organizationId);
    if (plan.limits.apiCallsPerDay <= 0) return { ok: false, error: "Your plan does not include API access." };
    if ((await countActiveKeys(v.organizationId)) >= MAX_ACTIVE_KEYS) {
      return { ok: false, error: `At most ${MAX_ACTIVE_KEYS} active keys — revoke one first.` };
    }
    const plaintext = newApiKeyPlaintext();
    await insertApiKey({
      id: newId(),
      organizationId: v.organizationId,
      name: v.name,
      prefix: apiKeyPrefix(plaintext),
      keyHash: hashApiKey(plaintext),
      createdBy: user.id,
    });
    revalidatePath(`/org/${v.organizationId}/api-keys`);
    // plaintext leaves the server exactly once, in this response
    return { ok: true, data: { plaintext, prefix: apiKeyPrefix(plaintext) } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeApiKeyAction(input: { organizationId: string; keyId: string }): Promise<ActionResult> {
  try {
    const v = z.object({ organizationId: orgId, keyId: z.string().uuid() }).parse(input);
    await requireOrgMember(v.organizationId, "admin");
    if (!(await revokeApiKey(v.organizationId, v.keyId))) return { ok: false, error: "Key not found or already revoked." };
    revalidatePath(`/org/${v.organizationId}/api-keys`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Billing ────────────────────────────────────────────────────────────

export async function startOrgCheckoutAction(input: {
  organizationId: string;
  planId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    const v = z.object({ organizationId: orgId, planId: z.enum(["org_basic", "org_pro"]) }).parse(input);
    const { user } = await requireOrgMember(v.organizationId, "admin");
    const current = await getOrgPlan(v.organizationId);
    if (current.id === v.planId) return { ok: false, error: "That is already your plan." };
    const res = await startCheckout({ user, planId: v.planId, organizationId: v.organizationId });
    return { ok: true, data: { url: res.authorizationUrl } };
  } catch (e) {
    return fail(e);
  }
}
