import { expect, test } from "@playwright/test";
import { SLOW } from "./helpers/ui";

/**
 * DoD 2 — open the latest weekly national report from /reports, check the
 * headline, the table and that every map image is served (200, SVG) and
 * actually painted, then download the PDF (application/pdf, > 20 KB).
 */
test.describe.configure({ timeout: 300_000 });

test("latest weekly report renders with maps and a PDF", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Weather reports" })).toBeVisible(SLOW);

  // archive is newest first; the first weekly national entry is the latest
  const latest = page.getByRole("link", { name: /^Weekly · Nigeria · / }).first();
  await expect(latest).toBeVisible();
  await latest.click();
  await page.waitForURL(/\/reports\/[^/]+$/, SLOW);
  const reportUrl = new URL(page.url());

  await expect(page.getByRole("heading", { level: 1, name: /Weekly weather report: Nigeria/ })).toBeVisible(SLOW);
  const headline = page.locator("main p.text-lg").first();
  await expect(headline).toBeVisible();
  expect((await headline.innerText()).trim().length).toBeGreaterThan(20);

  await expect(page.getByRole("heading", { name: "By state" })).toBeVisible();
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(30);

  // maps: each <img> must be served (200 image/svg+xml) and decoded
  const imgs = page.getByRole("region", { name: "Maps" }).locator("img");
  const n = await imgs.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded();
    const src = await img.getAttribute("src");
    expect(src).toMatch(new RegExp(`^${reportUrl.pathname}/map/`));
    const res = await page.request.get(src!, SLOW);
    expect(res.status(), src!).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/svg+xml");
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), SLOW)
      .toBe(true);
  }

  // PDF download
  const pdfLink = page.getByRole("link", { name: "Download PDF" });
  await expect(pdfLink).toBeVisible();
  const href = await pdfLink.getAttribute("href");
  expect(href).toBe(`${reportUrl.pathname}/pdf`);
  const pdf = await page.request.get(href!, SLOW);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const body = await pdf.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(20 * 1024);
});
