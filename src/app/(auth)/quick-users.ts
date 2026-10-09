import "server-only";
import { env } from "@/lib/env";

/**
 * Dev/e2e quick sign-in fixtures — the four seeded users
 * (scripts/seed-steps). Passwords are dev fixtures, not secrets, and are
 * only ever used server-side when AUTH_MOCK is on outside production.
 */
export const QUICK_USERS = [
  { email: "admin@weatherdesk.ng", label: "Platform admin", password: "admin12345" },
  { email: "editor@weatherdesk.ng", label: "Editor", password: "editor12345" },
  { email: "user@weatherdesk.ng", label: "User", password: "user12345" },
  { email: "orgowner@acme.ng", label: "Org owner (Acme Farms)", password: "owner12345" },
] as const;

export function quickSignInEnabled(): boolean {
  return env.AUTH_MOCK && env.NODE_ENV !== "production";
}
