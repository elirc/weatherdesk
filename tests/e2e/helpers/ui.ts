import { expect, type Page } from "@playwright/test";

/** Dev-mode first compiles on this box take up to ~90 s per route. */
export const SLOW = { timeout: 120_000 };

export const NIMET_BANNER = "Independent service — not affiliated with NiMet. Advisories are not official warnings.";

/** Unique, timestamp-suffixed identity for one test run. */
export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

/** Real UI sign-up (no verification required); lands on /dashboard. */
export async function signUp(page: Page, email: string, name = "E2E Tester"): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/, SLOW);
}

/** Create an organisation through /org; returns its id (from the URL). */
export async function createOrg(page: Page, name: string): Promise<string> {
  await page.goto("/org");
  await page.getByLabel("Organisation name").fill(name);
  await page.getByTestId("create-org").click();
  await page.waitForURL(/\/org\/(?!page)[^/?#]+$/, SLOW);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible(SLOW);
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();
  return orgId;
}
