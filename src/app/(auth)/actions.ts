"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/api/misc";
import { QUICK_USERS, quickSignInEnabled } from "./quick-users";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Auth server actions. Sign-in/up are proxied through actions so they are
 * rate-limited per IP (CONVENTIONS 8) before reaching Better Auth; the
 * nextCookies() plugin sets the session cookie from inside the action.
 */

type Result = { ok: true; next: string } | { ok: false; error: string };

async function ipKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const signInSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export async function signInAction(input: z.input<typeof signInSchema>): Promise<Result> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and password." };
  const ip = await ipKey();
  const rl = rateLimit(`signin:${ip}`, RATE_LIMITS.signIn.limit, RATE_LIMITS.signIn.windowMs);
  if (!rl.ok) return { ok: false, error: "Too many sign-in attempts. Try again in a few minutes." };
  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email.toLowerCase(), password: parsed.data.password },
      headers: await headers(),
    });
  } catch {
    return { ok: false, error: "Invalid email or password." };
  }
  return { ok: true, next: safeNext(parsed.data.next) };
}

const signUpSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(200),
  password: z.string().min(8).max(128),
  next: z.string().max(500).optional(),
});

export async function signUpAction(input: z.input<typeof signUpSchema>): Promise<Result> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form: name ≥ 2 chars, valid email, password ≥ 8 chars." };
  const ip = await ipKey();
  const rl = rateLimit(`signup:${ip}`, RATE_LIMITS.signIn.limit, RATE_LIMITS.signIn.windowMs);
  if (!rl.ok) return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  try {
    await auth.api.signUpEmail({
      body: { name: parsed.data.name, email: parsed.data.email.toLowerCase(), password: parsed.data.password },
      headers: await headers(),
    });
  } catch (e) {
    const msg = e instanceof Error && /exist/i.test(e.message) ? "An account with this email already exists." : "Could not create the account.";
    return { ok: false, error: msg };
  }
  return { ok: true, next: safeNext(parsed.data.next) };
}

// ── Dev/e2e quick sign-in (AUTH_MOCK only) ──────────────────────────────

const quickSchema = z.object({ email: z.email(), next: z.string().max(500).optional() });

export async function quickSignInAction(formData: FormData): Promise<void> {
  if (!quickSignInEnabled()) throw new Error("Quick sign-in is disabled");
  const parsed = quickSchema.parse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
  });
  const u = QUICK_USERS.find((q) => q.email === parsed.email);
  if (!u) throw new Error("Unknown quick sign-in user");
  await auth.api.signInEmail({ body: { email: u.email, password: u.password }, headers: await headers() });
  redirect(safeNext(parsed.next));
}
