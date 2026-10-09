import { expect, test } from "@playwright/test";
import { closeDb, q, teardownUser } from "./helpers/db";
import { SLOW, signUp, uniqueEmail } from "./helpers/ui";

/**
 * DoD 3 — sign up with a fresh email, save a place by searching for it
 * (the dashboard place picker is the save-from-search UI), see it on
 * /dashboard with a weather chip, toggle its alerts off and back on.
 */
test.describe.configure({ timeout: 300_000 });

const email = uniqueEmail("save");

test.afterAll(async () => {
  await teardownUser(email);
  await closeDb();
});

test("sign up → save a place → weather chip → toggle alerts", async ({ page }) => {
  await signUp(page, email);
  await expect(page.getByText("Nothing saved yet")).toBeVisible(SLOW);

  const picker = page.getByTestId("place-picker-input");
  await picker.fill("Gwadabawa");
  const result = page.locator("li").filter({ hasText: "Gwadabawa" }).filter({ has: page.getByRole("button", { name: "Save" }) }).first();
  await expect(result).toBeVisible(SLOW);
  await result.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved Gwadabawa")).toBeVisible(SLOW);

  const saved = page.getByTestId("saved-places").getByRole("listitem").filter({ hasText: "Gwadabawa" });
  await expect(saved).toHaveCount(1, SLOW);
  await expect(page.getByRole("heading", { name: "Saved places (1)" })).toBeVisible();
  // weather chip: "{tmax}° / {tmin}°", rain line and provenance
  await expect(saved.getByText(/-?\d+° \/ -?\d+°/)).toBeVisible();
  await expect(saved.getByText(/Rain [\d.]+ mm · \d+%/)).toBeVisible();
  await expect(saved.getByText(/Today · .+ · updated/)).toBeVisible();

  const [row] = await q<{ id: string; alerts_enabled: boolean }>(
    "select sp.id, sp.alerts_enabled from saved_places sp join users u on u.id = sp.user_id where u.email = $1",
    [email],
  );
  expect(row).toBeTruthy();

  const toggle = saved.getByRole("switch", { name: "Advisory alerts" });
  const initial = (await toggle.getAttribute("aria-checked")) === "true";
  expect(initial).toBe(row.alerts_enabled);

  const alertsInDb = async () =>
    (await q<{ alerts_enabled: boolean }>("select alerts_enabled from saved_places where id = $1", [row.id]))[0]
      .alerts_enabled;

  // off (or on) …
  // the switch is disabled while the server action runs (first call compiles
  // the action on a cold dev server), so wait on the SLOW budget
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(!initial), SLOW);
  await expect.poll(alertsInDb, SLOW).toBe(!initial);
  await page.reload();
  const toggleAfter = page
    .getByTestId("saved-places")
    .getByRole("listitem")
    .filter({ hasText: "Gwadabawa" })
    .getByRole("switch", { name: "Advisory alerts" });
  await expect(toggleAfter).toHaveAttribute("aria-checked", String(!initial), SLOW);

  // … and back
  await toggleAfter.click();
  await expect(toggleAfter).toHaveAttribute("aria-checked", String(initial), SLOW);
  await expect.poll(alertsInDb, SLOW).toBe(initial);
});
