import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { closeDb, q, teardownUser } from "./helpers/db";
import { SLOW, createOrg, signUp, uniqueEmail } from "./helpers/ui";

/**
 * DoD 4 — create an organisation, upgrade it to Organisation Basic through
 * the (mock) Paystack checkout, create an LGA-set custom area of 2 LGAs, then
 * obtain its branded report. The report is generated INLINE by the engine
 * (tests/e2e/helpers/branded-report-cli.ts, the same calls the seed uses)
 * rather than by queueing report.generate and racing whichever worker
 * process picks it up. Asserts the reports row carries organization_id and
 * that the ORG pdf route serves bytes to a member and nothing to anyone else.
 */
// cold dev server: billing, checkout, areas, reports and the PDF route each
// compile on first hit (~1 min apiece on this box), plus the engine run
test.describe.configure({ timeout: 900_000 });

const email = uniqueEmail("org");
const orgName = `E2E Branded ${Date.now()}`;

test.afterAll(async () => {
  await teardownUser(email);
  await closeDb();
});

test("org → paid plan → custom area → branded report PDF", async ({ page, playwright, baseURL }) => {
  await signUp(page, email);
  const orgId = await createOrg(page, orgName);

  // upgrade via mock checkout
  await page.goto(`/org/${orgId}/billing`);
  await page.getByTestId("checkout-org_basic").click();
  await page.waitForURL(/\/billing\/mock-checkout/, SLOW);
  await expect(page.getByText("TEST MODE")).toBeVisible(SLOW);
  await page.getByTestId("mock-pay").click();
  await page.waitForURL(/checkout=success/, SLOW);
  await expect(page.getByText(/Payment confirmed — you are now on Organisation Basic/)).toBeVisible(SLOW);

  // custom area: LGA set of two Sokoto LGAs
  await page.goto(`/org/${orgId}/areas`);
  await page.locator("#lga-area-name").fill("E2E Sokoto border");
  const filter = page.locator("#lga-filter");
  for (const lga of ["Gwadabawa", "Illela"]) {
    await filter.fill(lga);
    const box = page.getByRole("group", { name: "LGAs by state" }).getByRole("checkbox", { name: lga, exact: true });
    await expect(box).toBeVisible(SLOW);
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
  }
  await filter.fill("");
  const create = page.getByTestId("create-lga-area");
  await expect(create).toHaveText(/Create area \(2 LGAs\)/);
  await create.click();
  await expect(page.getByText("Area created")).toBeVisible(SLOW);
  await expect(page.getByTestId("custom-areas")).toContainText("E2E Sokoto border", SLOW);

  const areas = await q<{ id: string; n: number }>(
    "select id, cardinality(lga_ids) as n from custom_areas where organization_id = $1",
    [orgId],
  );
  expect(areas).toHaveLength(1);
  expect(areas[0].n).toBe(2);

  // branded report via the engine
  const out = execFileSync(
    process.execPath,
    [path.join("node_modules", "tsx", "dist", "cli.mjs"), path.join("tests", "e2e", "helpers", "branded-report-cli.ts"), areas[0].id, orgId],
    { encoding: "utf8", timeout: 180_000 },
  );
  const result = JSON.parse(out.trim().split("\n").pop()!) as { id: string; pdfKey: string; bytes: number };
  expect(result.bytes).toBeGreaterThan(10_000);

  const [row] = await q<{ organization_id: string; custom_area_id: string; scope_type: string; pdf_key: string | null }>(
    "select organization_id, custom_area_id, scope_type, pdf_key from reports where id = $1",
    [result.id],
  );
  expect(row.organization_id).toBe(orgId);
  expect(row.custom_area_id).toBe(areas[0].id);
  expect(row.pdf_key).toBeTruthy();

  // appears in the org's branded reports list with an org PDF link
  await page.goto(`/org/${orgId}/reports`);
  const list = page.getByTestId("org-reports");
  await expect(list).toBeVisible(SLOW);
  const pdfHref = `/org/${orgId}/reports/${result.id}/pdf`;
  await expect(list.locator(`a[href="${pdfHref}"]`)).toBeVisible();

  const pdf = await page.request.get(pdfHref, SLOW);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const body = await pdf.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBe(result.bytes);

  // private: not on the public route, not for anonymous visitors
  const pub = await page.request.get(`/reports/${result.id}/pdf`, SLOW);
  expect(pub.status()).toBe(404);
  const anon = await playwright.request.newContext({ baseURL });
  const anonRes = await anon.get(pdfHref, SLOW);
  expect(anonRes.status()).toBe(404);
  await anon.dispose();
});
