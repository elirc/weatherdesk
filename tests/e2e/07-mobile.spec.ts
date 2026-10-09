import { expect, test, type Page } from "@playwright/test";
import { SLOW } from "./helpers/ui";

/**
 * DoD 7 — mobile pass (Pixel 7, "mobile" project; tagged @mobile so only
 * that project's grep picks it up there). Home map visible + layer switch,
 * place page readable, farming tab plain-language blocks visible.
 */
test.describe.configure({ timeout: 300_000 });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only pass");
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("home map and layer switch @mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Weather for all of Nigeria" })).toBeVisible(SLOW);
  const map = page.getByRole("region", { name: "National map" });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible(SLOW);
  const box = await map.boundingBox();
  expect(box!.width).toBeGreaterThan(300);

  const layers = page.getByRole("radiogroup", { name: "Map layer" });
  await expect(layers.getByRole("radio", { name: "Rain today" })).toHaveAttribute("aria-checked", "true");
  await layers.getByRole("radio", { name: "Max temp" }).tap();
  await expect(layers.getByRole("radio", { name: "Max temp" })).toHaveAttribute("aria-checked", "true");
  await expect(layers.getByRole("radio", { name: "Rain today" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Max temperature today").first()).toBeVisible(SLOW);
  await expectNoHorizontalScroll(page);
});

test("place page is readable @mobile", async ({ page }) => {
  await page.goto("/place/lga/gwadabawa");
  await expect(page.getByRole("heading", { level: 1, name: "Gwadabawa" })).toBeVisible(SLOW);
  const days = page.getByRole("list", { name: "16-day forecast" }).getByRole("listitem");
  await expect(days).toHaveCount(16, SLOW);
  await days.first().scrollIntoViewIfNeeded();
  await expect(days.first()).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Next 48 hours" })).toBeVisible();
  // body text not microscopic on a phone
  const fontPx = await days.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(12);
  await expectNoHorizontalScroll(page);
});

test("farming tab plain-language blocks @mobile", async ({ page }) => {
  await page.goto("/place/lga/gwadabawa/farming");
  await expect(page.getByRole("heading", { name: "Have the rains started?" })).toBeVisible(SLOW);
  const next = page.getByRole("heading", { name: /Rain in the next \d+ days/ });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeVisible();
  await expect(page.getByText("Total rain expected")).toBeVisible();
  await expect(page.getByText(/Dry days ahead/)).toBeVisible();
  await expect(page.getByText(/not an official agricultural or weather advisory/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});
