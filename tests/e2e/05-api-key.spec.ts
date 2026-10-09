import { expect, test } from "@playwright/test";
import { closeDb, teardownUser } from "./helpers/db";
import { SLOW, createOrg, signUp, uniqueEmail } from "./helpers/ui";

/**
 * DoD 5 — create an API key in the org UI (plaintext shown once), call
 * /api/v1/forecast with it (200 + data + meta.attribution), then burst past
 * the per-minute limit (Free plan: 30/min) and expect 429 + Retry-After.
 */
test.describe.configure({ timeout: 300_000 });

const email = uniqueEmail("api");

test.afterAll(async () => {
  await teardownUser(email);
  await closeDb();
});

test("API key → authorised forecast call → 429 on burst", async ({ page, playwright, baseURL }) => {
  await signUp(page, email);
  const orgId = await createOrg(page, `E2E API ${Date.now()}`);

  await page.goto(`/org/${orgId}/api-keys`);
  await page.getByLabel("Key name").fill("e2e key");
  await page.getByTestId("create-api-key").click();
  const shown = page.getByTestId("api-key-plaintext");
  await expect(shown).toBeVisible(SLOW);
  await expect(shown).toContainText("will not be shown again");
  const key = (await shown.locator("code").innerText()).trim();
  expect(key).toMatch(/^wd_live_[0-9a-f]{40}$/);

  // once dismissed, the plaintext is gone for good
  await shown.getByRole("button", { name: "I've saved it" }).click();
  await expect(page.getByTestId("api-key-plaintext")).toHaveCount(0, SLOW);
  // list re-renders via router.refresh (slow on a cold dev server)
  await expect(page.getByTestId("api-keys")).toContainText("e2e key", SLOW);
  expect(await page.content()).not.toContain(key);

  // a cookie-less client: the key alone must authorise
  const api = await playwright.request.newContext({ baseURL });
  const auth = { Authorization: `Bearer ${key}` };

  const res = await api.get("/api/v1/forecast?lga=gwadabawa", { headers: auth, timeout: 120_000 });
  expect(res.status()).toBe(200);
  const json = (await res.json()) as {
    data: { place: { name: string }; daily: unknown[] };
    meta: { attribution: string; timezone: string };
  };
  expect(json.data.place.name).toBe("Gwadabawa");
  expect(json.data.daily.length).toBe(16);
  expect(json.meta.attribution).toContain("Open-Meteo");
  expect(json.meta.attribution).toContain("not affiliated with NiMet");
  expect(json.meta.timezone).toBe("Africa/Lagos");
  const limit = Number(res.headers()["x-ratelimit-limit"]);
  expect(limit).toBe(30);

  // a bad key is rejected
  const bad = await api.get("/api/v1/forecast?lga=gwadabawa", { headers: { Authorization: "Bearer wd_live_nope" } });
  expect(bad.status()).toBe(401);

  // burst past the per-minute limit
  let limited: Awaited<ReturnType<typeof api.get>> | null = null;
  for (let i = 0; i < limit + 5 && !limited; i++) {
    const r = await api.get("/api/v1/forecast?lga=gwadabawa", { headers: auth });
    if (r.status() === 429) limited = r;
    else expect(r.status()).toBe(200);
  }
  expect(limited, "expected a 429 within limit+5 requests").not.toBeNull();
  const retryAfter = Number(limited!.headers()["retry-after"]);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(60);
  const err = (await limited!.json()) as { error: { code: string } };
  expect(err.error.code).toBe("rate_limited");
  await api.dispose();
});
