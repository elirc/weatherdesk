import "dotenv/config";
import "@/worker/preload-env";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "./setup";

/**
 * Pipeline integration (mock adapters, TEST_DATABASE_URL). Exercises job
 * cores directly — no pg-boss — so it needs no running worker. Code paths
 * that enqueue follow-up jobs (alert notifications, refresh fan-out,
 * backfill → normals) are avoided or called at the core level.
 *
 * Run by the orchestrator only (serial): pnpm test:integration
 */

type Mods = {
  db: typeof import("@/db");
  schema: typeof import("@/db/schema");
  forecast: typeof import("@/worker/jobs/forecast");
  daily: typeof import("@/worker/jobs/daily");
  observed: typeof import("@/worker/jobs/observed");
  alerts: typeof import("@/worker/jobs/alerts");
  accuracy: typeof import("@/worker/jobs/accuracy");
  history: typeof import("@/worker/jobs/history");
  time: typeof import("@/lib/time");
};
let m: Mods;
let cellId: number;
let lgaId: number;

const square = { type: "MultiPolygon", coordinates: [[[[3.3, 6.5], [3.4, 6.5], [3.4, 6.6], [3.3, 6.6], [3.3, 6.5]]]] };

beforeAll(async () => {
  m = {
    db: await import("@/db"),
    schema: await import("@/db/schema"),
    forecast: await import("@/worker/jobs/forecast"),
    daily: await import("@/worker/jobs/daily"),
    observed: await import("@/worker/jobs/observed"),
    alerts: await import("@/worker/jobs/alerts"),
    accuracy: await import("@/worker/jobs/accuracy"),
    history: await import("@/worker/jobs/history"),
    time: await import("@/lib/time"),
  };
  await truncateAll();
  const { db } = m.db;
  const s = m.schema;
  const [cell] = await db
    .insert(s.gridCells)
    .values({ latIdx: 65, lonIdx: 33, centreLat: 6.55, centreLon: 3.35, active: true, origin: "lga" })
    .returning({ id: s.gridCells.id });
  cellId = cell.id;
  const [state] = await db
    .insert(s.states)
    .values({ name: "Lagos", slug: "lagos", code: "NG-LA", zone: "south-west", centreLat: 6.55, centreLon: 3.35, boundaryGeojson: square })
    .returning({ id: s.states.id });
  const [lga] = await db
    .insert(s.lgas)
    .values({
      stateId: state.id,
      name: "Ikeja",
      slug: "ikeja",
      code: "TEST-IKEJA",
      zone: "south-west",
      centreLat: 6.55,
      centreLon: 3.35,
      gridCellId: cellId,
      boundaryGeojson: square,
    })
    .returning({ id: s.lgas.id });
  lgaId = lga.id;
}, 60_000);

afterAll(async () => {
  await m?.db.pool.end().catch(() => undefined);
});

describe("pipeline (mock mode)", () => {
  it("stores a 16-day forecast with latest-run-only semantics", async () => {
    const { db } = m.db;
    const s = m.schema;
    const cells = [{ id: cellId, lat: 6.55, lon: 3.35 }];
    const r1 = await m.forecast.fetchAndStoreForecast(cells);
    expect(r1.stored).toBeGreaterThan(0);
    const d1 = await db.select().from(s.forecastDaily).where(eq(s.forecastDaily.gridCellId, cellId));
    const h1 = await db.select().from(s.forecastHourly).where(eq(s.forecastHourly.gridCellId, cellId));
    expect(d1).toHaveLength(16);
    expect(h1.length).toBeGreaterThanOrEqual(48);
    expect(d1.every((r) => r.source === "mock" && r.fetchedAt instanceof Date)).toBe(true);

    await m.forecast.fetchAndStoreForecast(cells);
    const d2 = await db.select().from(s.forecastDaily).where(eq(s.forecastDaily.gridCellId, cellId));
    expect(d2).toHaveLength(16);
    expect(new Set(d2.map((r) => r.fetchedAt.getTime())).size).toBe(1);
  });

  it("archives the lead-day snapshot idempotently", async () => {
    const today = m.time.lagosToday();
    const n = await m.daily.archiveSnapshot(today);
    expect(n).toBe(7);
    await m.daily.archiveSnapshot(today);
    const rows = await m.db.db.select().from(m.schema.forecastArchive).where(eq(m.schema.forecastArchive.issueDate, today));
    expect(rows.map((r) => r.leadDays).sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 7, 10, 14]);
  });

  it("preliminary observed never overwrites a final row", async () => {
    const { db } = m.db;
    const s = m.schema;
    const today = m.time.lagosToday();
    const finalDate = m.time.addDaysIso(today, -3);
    await db.insert(s.observedDaily).values({
      gridCellId: cellId,
      date: finalDate,
      rainMm: 123.4,
      tmaxC: 1,
      tminC: 0,
      source: "nasa_power",
      preliminary: false,
    });
    const res = await m.observed.storeRecentObserved([{ id: cellId, lat: 6.55, lon: 3.35 }], 7);
    expect(res.rows).toBe(7);
    const rows = await db.select().from(s.observedDaily).where(eq(s.observedDaily.gridCellId, cellId));
    const fin = rows.find((r) => r.date === finalDate)!;
    expect(fin).toMatchObject({ rainMm: 123.4, source: "nasa_power", preliminary: false });
    expect(rows.filter((r) => r.preliminary).every((r) => r.source === "model_estimate")).toBe(true);
  });

  it("NASA top-up replaces preliminary rows with final ones up to today-2", async () => {
    const today = m.time.lagosToday();
    const r = await m.observed.nasaTopUp([{ id: cellId, lat: 6.55, lon: 3.35 }], today);
    expect(r.finalised.has(m.time.addDaysIso(today, -2))).toBe(true);
    const rows = await m.db.db
      .select()
      .from(m.schema.observedDaily)
      .where(and(eq(m.schema.observedDaily.gridCellId, cellId), eq(m.schema.observedDaily.date, m.time.addDaysIso(today, -2))));
    expect(rows[0]).toMatchObject({ source: "nasa_power", preliminary: false });
  });

  it("issues alerts once per LGA/type/window (idempotent re-run)", async () => {
    const { db } = m.db;
    const s = m.schema;
    await db.insert(s.alertRules).values({
      id: "test-heat",
      type: "heat",
      threshold: -100, // always triggers on every forecast day
      severity: "moderate",
      template: "Heat {value}C in {lga} on {date}",
      enabled: true,
    });
    const today = m.time.lagosToday();
    const first = await m.alerts.evaluateAndIssueAlerts(today);
    expect(first.created).toBe(1); // 7 consecutive days merge into one window
    const second = await m.alerts.evaluateAndIssueAlerts(today);
    expect(second.created).toBe(0);
    const rows = await db.select().from(s.alerts).where(eq(s.alerts.lgaId, lgaId));
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain("Ikeja");
    await db.update(s.alertRules).set({ enabled: false }).where(eq(s.alertRules.id, "test-heat"));
  });

  it("recomputes accuracy for zone + national", async () => {
    const { db } = m.db;
    const s = m.schema;
    const today = m.time.lagosToday();
    const target = m.time.addDaysIso(today, -3);
    await db.insert(s.forecastArchive).values({
      gridCellId: cellId,
      issueDate: m.time.addDaysIso(target, -1),
      targetDate: target,
      leadDays: 1,
      tmaxC: 3,
      tminC: 0,
      rainProbPct: 90,
      rainMm: 50,
    });
    const r = await m.accuracy.updateAccuracy(m.time.addDaysIso(today, -1), [target]);
    expect(r.buckets).toBeGreaterThanOrEqual(2);
    const stats = await db.select().from(s.accuracyStats).where(eq(s.accuracyStats.leadDays, 1));
    const sw = stats.find((x) => x.zone === "south-west" && x.month === `${target.slice(0, 7)}-01`);
    expect(sw).toMatchObject({ maeTmax: 2, maeTmin: 0, rainHitRate: 1, nSamples: 1 });
    expect(stats.some((x) => x.zone === "national")).toBe(true);
  });

  it("backfills history and computes normals", async () => {
    const rows = await m.observed.backfillCell({ id: cellId, lat: 6.55, lon: 3.35 }, [
      { start: "1991-01-01", end: "1991-12-31" },
      { start: "1992-01-01", end: "1992-12-31" },
    ]);
    expect(rows).toBe(365 + 366);
    const r = await m.history.normalsComputeCell({ gridCellId: cellId });
    expect(r.months).toBe(12);
    const normals = await m.db.db.select().from(m.schema.normalsMonthly).where(eq(m.schema.normalsMonthly.gridCellId, cellId));
    expect(normals).toHaveLength(12);
  });

  it("deactivates stale on-demand cells only", async () => {
    const { db } = m.db;
    const s = m.schema;
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db.insert(s.gridCells).values([
      { latIdx: 90, lonIdx: 70, centreLat: 9.05, centreLon: 7.05, active: true, origin: "on_demand", lastViewedAt: old },
      { latIdx: 91, lonIdx: 70, centreLat: 9.15, centreLon: 7.05, active: true, origin: "on_demand", lastViewedAt: new Date() },
    ]);
    expect(await m.daily.deactivateStaleOnDemand()).toBe(1);
    const [lgaCell] = await db.select().from(s.gridCells).where(eq(s.gridCells.id, cellId));
    expect(lgaCell.active).toBe(true);
  });
});
