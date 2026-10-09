import { expect, test } from "@playwright/test";
import { closeDb, q } from "./helpers/db";
import { SLOW } from "./helpers/ui";

/**
 * DoD 6 — provider failure leaves pages working on last good data with its
 * age shown.
 *
 * (a) Fresh data: the place page carries the provenance/DataAge line and no
 *     "delayed" notice.
 * (b) Stale data: backdate one cell's forecast_daily/forecast_hourly
 *     fetched_at by 13 h (> the 12 h threshold), load that place, assert the
 *     "last good data" notice AND the forecast still rendering. fetched_at is
 *     restored afterwards (shifted back by the same interval).
 *
 * The forecast view is "use cache" (30 min), so (b) picks a random LGA whose
 * cell has never been rendered by this server run, and backdates BEFORE the
 * first visit — a cold cache reads the DB.
 */
test.describe.configure({ timeout: 300_000 });

const SHIFT = "13 hours";

test.afterAll(async () => {
  await closeDb();
});

test("fresh forecast shows its provenance and age", async ({ page }) => {
  await page.goto("/place/lga/gwadabawa");
  const days = page.getByRole("list", { name: "16-day forecast" }).getByRole("listitem");
  await expect(days).toHaveCount(16, SLOW);
  await expect(page.getByText("Forecast source").first()).toBeVisible();
  await expect(page.getByText(/(just now|\d+ min ago|\d+ h ago)/).first()).toBeVisible();
  await expect(page.getByText("Forecast update delayed")).toHaveCount(0);
});

test("stale forecast renders last good data with a delay notice", async ({ page }) => {
  // a random LGA with its own forecast rows, not one other specs visit
  const [pick] = await q<{ slug: string; name: string; cell: number }>(
    `select l.slug, l.name, l.grid_cell_id as cell
       from lgas l
      where l.slug not in ('gwadabawa', 'illela', 'tangaza')
        and exists (select 1 from forecast_daily f where f.grid_cell_id = l.grid_cell_id)
        and (select count(*) from lgas o where o.grid_cell_id = l.grid_cell_id) = 1
        and (select max(fetched_at) from forecast_daily f where f.grid_cell_id = l.grid_cell_id) > now() - interval '6 hours'
      order by random() limit 1`,
  );
  expect(pick, "need an LGA with fresh forecast rows").toBeTruthy();

  await q(`update forecast_daily set fetched_at = fetched_at - interval '${SHIFT}' where grid_cell_id = $1`, [pick.cell]);
  await q(`update forecast_hourly set fetched_at = fetched_at - interval '${SHIFT}' where grid_cell_id = $1`, [pick.cell]);
  try {
    await page.goto(`/place/lga/${pick.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: pick.name })).toBeVisible(SLOW);
    await expect(page.getByText("Forecast update delayed")).toBeVisible(SLOW);
    await expect(page.getByText(/Showing last good data from \d+ h ago/)).toBeVisible();
    // the page still works on that data
    const days = page.getByRole("list", { name: "16-day forecast" }).getByRole("listitem");
    expect(await days.count()).toBeGreaterThan(0);
    await expect(days.first()).toContainText(/°/);
    await expect(page.getByText("Forecast source").first()).toBeVisible();
  } finally {
    // only shift back rows still in the backdated state (a worker refresh in
    // the meantime would already have written a fresh fetched_at)
    await q(
      `update forecast_daily set fetched_at = fetched_at + interval '${SHIFT}'
        where grid_cell_id = $1 and fetched_at < now() - interval '12 hours'`,
      [pick.cell],
    );
    await q(
      `update forecast_hourly set fetched_at = fetched_at + interval '${SHIFT}'
        where grid_cell_id = $1 and fetched_at < now() - interval '12 hours'`,
      [pick.cell],
    );
  }
});
