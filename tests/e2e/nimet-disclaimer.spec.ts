import { expect, test } from "@playwright/test";
import { NIMET_BANNER, SLOW } from "./helpers/ui";

/**
 * Smoke: the NiMet disclaimer is in the header banner AND the footer of
 * every top-level public page (CONVENTIONS rule 13).
 */
test.describe.configure({ timeout: 180_000 });

const PAGES = ["/", "/alerts", "/accuracy", "/reports", "/about", "/place/lga/gwadabawa"];
const FOOTER = "It is not affiliated with the Nigerian Meteorological Agency (NiMet).";

for (const path of PAGES) {
  test(`NiMet disclaimer on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("header").getByText(NIMET_BANNER).first()).toBeVisible(SLOW);
    const footer = page.locator("footer").last();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText(FOOTER);
    await expect(footer).toContainText("not official weather warnings");
  });
}
