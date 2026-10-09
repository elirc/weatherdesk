"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, requireUser, type ActionResult } from "@/lib/authz";
import { ensureGridCell } from "@/lib/geo/lookup";
import { inNigeriaBbox } from "@/lib/geo/zones";
import { newId } from "@/lib/ids";
import { JOBS, sendJob } from "@/lib/queue";
import { startCheckout } from "@/lib/api/checkout";
import { getUserAddon } from "@/lib/api/limits";
import { toE164Ng } from "@/lib/api/misc";
import {
  countActiveDailySends,
  countSavedPlaces,
  deleteDailySend,
  deleteReportSubscription,
  deleteSavedPlace,
  insertDailySend,
  insertReportSubscription,
  insertSavedPlace,
  MAX_SAVED_PLACES,
  resolvePlaceTarget,
  savedPlaceDuplicate,
  savedPlaceOwned,
  setDailySendActive,
  setSavedPlaceAlerts,
  stateExists,
  type PlaceTarget,
} from "@/server/queries/account";
import { cancelUserSubscription } from "@/server/queries/billing";

/** Dashboard server actions — requireUser first, Zod, userId-scoped queries. */

const savePlaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["state", "lga", "settlement"]), id: z.number().int().positive() }),
  z.object({
    kind: z.literal("point"),
    lat: z.number().finite(),
    lon: z.number().finite(),
    name: z.string().trim().min(1).max(80).optional(),
  }),
]);

export async function savePlaceAction(input: z.input<typeof savePlaceSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const v = savePlaceSchema.parse(input);
    if ((await countSavedPlaces(user.id)) >= MAX_SAVED_PLACES) {
      return { ok: false, error: `You can save up to ${MAX_SAVED_PLACES} places.` };
    }
    let target: PlaceTarget | null;
    if (v.kind === "point") {
      if (!inNigeriaBbox(v.lat, v.lon)) return { ok: false, error: "That point is outside Nigeria." };
      target = {
        name: v.name ?? `${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}`,
        kind: "point",
        lat: v.lat,
        lon: v.lon,
        stateId: null,
        lgaId: null,
        settlementId: null,
      };
    } else {
      target = await resolvePlaceTarget(v.kind, v.id);
    }
    if (!target) return { ok: false, error: "Place not found." };
    if (await savedPlaceDuplicate(user.id, target)) return { ok: false, error: `${target.name} is already saved.` };
    const cell = await ensureGridCell(target.lat, target.lon);
    const id = newId();
    await insertSavedPlace(user.id, id, target, cell.id);
    if (target.kind === "point" || cell.created) {
      // new/on-demand cells need a forecast fetch + history backfill (worker job; never a provider call here)
      await sendJob(JOBS.cellActivate, { lat: target.lat, lon: target.lon }).catch(() => null);
    }
    revalidatePath("/dashboard");
    return { ok: true, data: { id } };
  } catch (e) {
    return actionError(e);
  }
}

const idSchema = z.object({ id: z.string().uuid() });

export async function togglePlaceAlertsAction(input: { id: string; enabled: boolean }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.extend({ enabled: z.boolean() }).parse(input);
    if (!(await setSavedPlaceAlerts(user.id, v.id, v.enabled))) return { ok: false, error: "Place not found." };
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function deletePlaceAction(input: { id: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.parse(input);
    if (!(await deleteSavedPlace(user.id, v.id))) return { ok: false, error: "Place not found." };
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

// ── Report subscriptions ───────────────────────────────────────────────

const reportSubSchema = z.object({
  reportType: z.enum(["weekly", "monthly"]),
  scopeKey: z.string().regex(/^(national|state:\d{1,3})$/),
});

export async function subscribeReportAction(input: z.input<typeof reportSubSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = reportSubSchema.parse(input);
    if (v.scopeKey !== "national" && !(await stateExists(Number(v.scopeKey.slice(6))))) {
      return { ok: false, error: "Unknown state." };
    }
    const created = await insertReportSubscription(user.id, newId(), v.reportType, v.scopeKey);
    if (!created) return { ok: false, error: "You are already subscribed to that report." };
    revalidatePath("/dashboard/subscriptions");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function unsubscribeReportAction(input: { id: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.parse(input);
    if (!(await deleteReportSubscription(user.id, v.id))) return { ok: false, error: "Subscription not found." };
    revalidatePath("/dashboard/subscriptions");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

// ── Daily SMS / WhatsApp add-on ────────────────────────────────────────

export async function startSmsCheckoutAction(): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await requireUser();
    if (await getUserAddon(user.id, "sms_daily")) return { ok: false, error: "You already have the daily forecast add-on." };
    const res = await startCheckout({ user, planId: "sms_daily" });
    return { ok: true, data: { url: res.authorizationUrl } };
  } catch (e) {
    return actionError(e);
  }
}

const dailySchema = z.object({
  savedPlaceId: z.string().uuid(),
  channel: z.enum(["sms", "whatsapp"]),
  hour: z.number().int().min(0).max(23),
  phone: z.string().min(7).max(20),
});

export async function createDailySendAction(input: z.input<typeof dailySchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = dailySchema.parse(input);
    const addon = await getUserAddon(user.id, "sms_daily");
    if (!addon) return { ok: false, error: "Subscribe to the daily forecast add-on first." };
    const phone = toE164Ng(v.phone);
    if (!phone) return { ok: false, error: "Enter a Nigerian mobile number." };
    if (!(await savedPlaceOwned(user.id, v.savedPlaceId))) return { ok: false, error: "Pick one of your saved places." };
    // sms_daily allows 1 active send (plans.limits.dailySends)
    if ((await countActiveDailySends(user.id)) >= 1) {
      return { ok: false, error: "Your add-on covers one daily send. Pause or delete the existing one first." };
    }
    await insertDailySend({
      id: newId(),
      userId: user.id,
      savedPlaceId: v.savedPlaceId,
      channel: v.channel,
      phone,
      sendTimeLocal: `${String(v.hour).padStart(2, "0")}:00:00`,
    });
    revalidatePath("/dashboard/daily");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleDailySendAction(input: { id: string; active: boolean }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.extend({ active: z.boolean() }).parse(input);
    if (v.active) {
      if (!(await getUserAddon(user.id, "sms_daily"))) return { ok: false, error: "Your add-on is not active." };
      if ((await countActiveDailySends(user.id)) >= 1) return { ok: false, error: "Only one daily send can be active." };
    }
    if (!(await setDailySendActive(user.id, v.id, v.active))) return { ok: false, error: "Not found." };
    revalidatePath("/dashboard/daily");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteDailySendAction(input: { id: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.parse(input);
    if (!(await deleteDailySend(user.id, v.id))) return { ok: false, error: "Not found." };
    revalidatePath("/dashboard/daily");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelAddonAction(input: { id: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const v = idSchema.parse(input);
    if (!(await cancelUserSubscription(user.id, v.id))) return { ok: false, error: "Subscription not found." };
    revalidatePath("/dashboard/daily");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
