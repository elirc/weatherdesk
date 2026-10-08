import "server-only";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import { auth } from "@/lib/auth";

/**
 * Server-side authorization helpers. EVERY Server Action and route handler
 * calls one of these first (CONVENTIONS rule 7). They throw AuthzError on
 * failure; actions catch it and return { ok: false, error }.
 */

export class AuthzError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthzError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "editor" | "admin";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { role?: string };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: (u.role as SessionUser["role"]) ?? "user",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthzError("Sign in required");
  return user;
}

/** Editors and platform admins. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "editor" && user.role !== "admin") {
    throw new AuthzError("Editor access required");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthzError("Admin access required");
  return user;
}

/**
 * Membership check. Returns the member role. Organisation data must ALSO be
 * scoped by organizationId inside every query — this guards the entry point.
 */
export async function requireOrgMember(
  organizationId: string,
  minRole: "member" | "admin" | "owner" = "member",
): Promise<{ user: SessionUser; memberRole: string }> {
  const user = await requireUser();
  const [m] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, user.id)))
    .limit(1);
  if (!m) throw new AuthzError("Not a member of this organisation");
  const order = { member: 0, admin: 1, owner: 2 } as const;
  const have = order[(m.role as keyof typeof order)] ?? 0;
  if (have < order[minRole]) throw new AuthzError("Insufficient organisation role");
  return { user, memberRole: m.role };
}

/** Standard action result helper. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function actionError(e: unknown): { ok: false; error: string } {
  if (e instanceof AuthzError) return { ok: false, error: e.message };
  if (e instanceof Error && e.name === "ZodError") {
    return { ok: false, error: "Invalid input" };
  }
  throw e;
}
