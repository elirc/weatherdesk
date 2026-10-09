import { expect, test } from "@playwright/test";
import { SLOW } from "./helpers/ui";

/**
 * DoD 1 — search a remote (non-capital) LGA, open its place page and check
 * the 16-day forecast, confidence badges and provenance line; then the
 * Climate tab (normals chart + season card) and History tab (table rows).
 */
test.describe.configure({ timeout: 300_000 });

test("search a remote LGA → forecast, climate and history", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search places" });
  await expect(search).toBeVisible(SLOW);
  await search.fill("Gwadabawa");

  const option = page.getByRole("option").filter({ hasText: "Gwadabawa" }).filter({ hasText: "LGA" }).first();
  await expect(option).toBeVisible(SLOW);
  await option.click();
  await page.waitForURL(/\/place\/lga\/gwadabawa$/, SLOW);

  // Forecast tab
  await expect(page.getByRole("heading", { level: 1, name: "Gwadabawa" })).toBeVisible(SLOW);
  await expect(page.getByText(/LGA · Sokoto/)).toBeVisible();
  const days = page.getByRole("list", { name: "16-day forecast" }).getByRole("listitem");
  await expect(days).toHaveCount(16, SLOW);
  await expect(days.first()).toContainText("Today");
  await expect(days.first()).toContainText("high confidence");
  await expect(days.last()).toContainText("low confidence");
  // provenance line: source badge + data age
  const provenance = page.getByText("Forecast source").first();
  await expect(provenance).toBeVisible();
  await expect(page.getByText(/Times in WAT \(UTC\+1\)/).first()).toBeVisible();
  await expect(page.getByText(/(just now|\d+ min ago|\d+ h ago|\d+ days ago)/).first()).toBeVisible();

  // Climate tab
  const tabs = page.getByRole("navigation", { name: "Place sections" });
  await tabs.getByRole("link", { name: "Climate" }).click();
  await page.waitForURL(/\/place\/lga\/gwadabawa\/climate$/, SLOW);
  await expect(page.getByRole("heading", { name: "Monthly normals" })).toBeVisible(SLOW);
  const chart = page.getByRole("img", { name: "Monthly rainfall bars with maximum and minimum temperature lines" });
  await expect(chart).toBeVisible(SLOW);
  await expect(chart.locator("svg.recharts-surface").first()).toBeVisible(SLOW);
  await expect(page.getByRole("heading", { name: "Typical rainy season" })).toBeVisible();
  await expect(page.getByText("Rains usually start")).toBeVisible();
  await expect(page.getByText("Season length")).toBeVisible();

  // History tab
  await page.getByRole("navigation", { name: "Place sections" }).getByRole("link", { name: "History" }).click();
  await page.waitForURL(/\/place\/lga\/gwadabawa\/history/, SLOW);
  await expect(page.getByRole("heading", { name: /Daily values \(\d+ days\)/ })).toBeVisible(SLOW);
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(5);
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
});
