import "server-only";
import { notFound } from "next/navigation";
import { AuthzError, requireAdmin, requireEditor, type SessionUser } from "@/lib/authz";

/**
 * Page-level staff guards. Non-staff get a 404 (notFound) rather than a
 * redirect, so the staff area does not advertise itself. Used by the
 * layouts AND every page body (defence in depth); actions call
 * requireEditor / requireAdmin directly and return { ok: false }.
 */
export async function staffPageGuard(level: "editor" | "admin" = "editor"): Promise<SessionUser> {
  try {
    return level === "admin" ? await requireAdmin() : await requireEditor();
  } catch (e) {
    if (e instanceof AuthzError) notFound();
    throw e;
  }
}
