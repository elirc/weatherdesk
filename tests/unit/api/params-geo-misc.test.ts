import { describe, expect, it } from "vitest";
import { validateAreaGeojson } from "@/lib/api/geojson";
import { previousWeekMonday, safeNext, slugifyOrgName, sniffImageType, toCsv, toE164Ng } from "@/lib/api/misc";
import { outlinePath, rewindForD3 } from "@/lib/api/outline";
import { alertsParams, forecastParams, historyParams, reportsParams } from "@/lib/api/params";
import { addOneMonth, parsePaystackEvent } from "@/lib/api/paystack";
import { envelope, zodMessage } from "@/lib/api/respond";

describe("API param schemas", () => {
  it("forecast needs lga XOR lat+lon", () => {
    expect(forecastParams.safeParse({ lga: "ikeja" }).success).toBe(true);
    expect(forecastParams.safeParse({ lat: "6.6", lon: "3.35", hourly: "true" }).data).toMatchObject({ lat: 6.6, lon: 3.35, hourly: true });
    expect(forecastParams.safeParse({}).success).toBe(false);
    expect(forecastParams.safeParse({ lat: "6.6" }).success).toBe(false);
    expect(forecastParams.safeParse({ lat: "6.6", lon: "3.3", lga: "ikeja" }).success).toBe(false);
    expect(forecastParams.safeParse({ lat: "51.5", lon: "0" }).success).toBe(false); // London
  });
  it("history is capped at one year", () => {
    expect(historyParams.safeParse({ lga: "ikeja", from: "2025-01-01", to: "2025-12-31" }).success).toBe(true);
    expect(historyParams.safeParse({ lga: "ikeja", from: "2024-01-01", to: "2024-12-31" }).success).toBe(true); // 366 (leap)
    expect(historyParams.safeParse({ lga: "ikeja", from: "2024-01-01", to: "2025-01-01" }).success).toBe(false);
    expect(historyParams.safeParse({ lga: "ikeja", from: "2025-02-01", to: "2025-01-01" }).success).toBe(false);
    expect(historyParams.safeParse({ lga: "ikeja", from: "2025-13-01", to: "2025-12-01" }).success).toBe(false);
  });
  it("alerts / reports", () => {
    expect(alertsParams.parse({ state: "ng-la" })).toEqual({ state: "NG-LA", active: true });
    expect(alertsParams.safeParse({ state: "NG-LA", lga: "ikeja" }).success).toBe(false);
    expect(alertsParams.parse({ active: "false" }).active).toBe(false);
    expect(reportsParams.parse({})).toEqual({ limit: 10 });
    expect(reportsParams.safeParse({ limit: "51" }).success).toBe(false);
    expect(reportsParams.parse({ scope: "national", type: "weekly" })).toMatchObject({ scope: "national", type: "weekly" });
  });
  it("envelope + error formatting", () => {
    const e = envelope([1], { source: "mock", fetchedAt: new Date("2026-10-08T00:00:00Z") });
    expect(e.meta.fetchedAt).toBe("2026-10-08T00:00:00.000Z");
    expect(e.meta.attribution).toMatch(/NiMet/);
    expect(zodMessage([{ path: ["to"], message: "bad" }])).toBe("to: bad");
  });
});

describe("custom-area polygon validation", () => {
  const ring = [
    [7.35, 10.45],
    [7.6, 10.45],
    [7.6, 10.65],
    [7.35, 10.65],
    [7.35, 10.45],
  ];
  it("accepts Polygon / MultiPolygon / Feature and normalises to MultiPolygon", () => {
    const a = validateAreaGeojson({ type: "Polygon", coordinates: [ring] });
    expect(a.ok && a.geometry.type).toBe("MultiPolygon");
    expect(a.ok && a.vertices).toBe(5);
    expect(validateAreaGeojson(JSON.stringify({ type: "MultiPolygon", coordinates: [[ring]] })).ok).toBe(true);
    expect(validateAreaGeojson({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }).ok).toBe(true);
  });
  it("rejects open rings, short rings, outside-Nigeria and swapped lat/lon", () => {
    const open = validateAreaGeojson({ type: "Polygon", coordinates: [ring.slice(0, 4)] });
    expect(open.ok).toBe(false);
    expect(validateAreaGeojson({ type: "Polygon", coordinates: [[[7, 10], [7.1, 10], [7, 10]]] }).ok).toBe(false);
    // Lagos given as [lat, lon] by mistake → latitude 3.3 is south of Nigeria
    const lagos = [
      [3.3, 6.5],
      [3.4, 6.5],
      [3.4, 6.6],
      [3.3, 6.6],
      [3.3, 6.5],
    ];
    expect(validateAreaGeojson({ type: "Polygon", coordinates: [lagos] }).ok).toBe(true);
    const swapped = validateAreaGeojson({ type: "Polygon", coordinates: [lagos.map(([x, y]) => [y, x])] });
    expect(swapped.ok).toBe(false);
    if (!swapped.ok) expect(swapped.error).toMatch(/outside Nigeria/);
    expect(validateAreaGeojson({ type: "Point", coordinates: [7, 10] }).ok).toBe(false);
    expect(validateAreaGeojson("{not json").ok).toBe(false);
  });
  it("rejects zero-area rings", () => {
    expect(validateAreaGeojson({ type: "Polygon", coordinates: [[[7, 10], [7.1, 10], [7.2, 10], [7, 10]]] }).ok).toBe(false);
  });
  it("renders a d3-geo outline after rewinding RFC 7946 rings", () => {
    const g = { type: "Polygon" as const, coordinates: [ring as [number, number][]] };
    expect(rewindForD3(g).coordinates[0]![1]).toEqual([7.35, 10.65]); // reversed (now clockwise)
    const o = outlinePath([g], 240, 180);
    expect(o?.d).toMatch(/^M/);
    // a correctly wound ring stays inside the box (the "whole globe" bug would span the full extent oddly)
    const nums = (o?.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(240);
  });
});

describe("misc helpers", () => {
  it("safeNext only allows same-site relative paths", () => {
    expect(safeNext("/org/abc")).toBe("/org/abc");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext(null, "/x")).toBe("/x");
  });
  it("toE164Ng", () => {
    expect(toE164Ng("0803 123 4567")).toBe("+2348031234567");
    expect(toE164Ng("+234 803 123 4567")).toBe("+2348031234567");
    expect(toE164Ng("2348031234567")).toBe("+2348031234567");
    expect(toE164Ng("0103 123 4567")).toBeNull();
    expect(toE164Ng("12345")).toBeNull();
  });
  it("slugifyOrgName", () => {
    expect(slugifyOrgName("Ọ̀yọ́ Farms & Co.", "ab12")).toBe("oyo-farms-co-ab12");
    expect(slugifyOrgName("!!!")).toBe("org");
  });
  it("previousWeekMonday", () => {
    expect(previousWeekMonday("2026-10-08")).toBe("2026-09-28"); // Thu → Monday of last week
    expect(previousWeekMonday("2026-10-05")).toBe("2026-09-28"); // Mon
    expect(previousWeekMonday("2026-10-11")).toBe("2026-09-28"); // Sun
  });
  it("sniffImageType trusts magic numbers, not names", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode("<svg"))).toBeNull();
  });
  it("toCsv escapes per RFC 4180", () => {
    expect(toCsv(["a", "b"], [["x,y", 'q"q'], [null, 1]])).toBe('a,b\r\n"x,y","q""q"\r\n,1\r\n');
  });
});

describe("paystack webhook parsing", () => {
  it("parses the events we handle and flags unknown ones as ignorable", () => {
    const c = parsePaystackEvent(JSON.stringify({ event: "charge.success", data: { reference: "abc-123", amount: 5000000, customer: { customer_code: "CUS_1" } } }));
    expect(c.ok && c.event.event).toBe("charge.success");
    const s = parsePaystackEvent(JSON.stringify({ event: "subscription.create", data: { subscription_code: "SUB_1", customer: { customer_code: "CUS_1" }, next_payment_date: "2026-11-08T00:00:00.000Z" } }));
    expect(s.ok && s.event.event === "subscription.create" && s.event.data.subscription_code).toBe("SUB_1");
    expect(parsePaystackEvent(JSON.stringify({ event: "subscription.disable", data: { subscription_code: "SUB_1" } })).ok).toBe(true);
    const u = parsePaystackEvent(JSON.stringify({ event: "transfer.success", data: {} }));
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.ignored).toBe(true);
    const bad = parsePaystackEvent("not json");
    expect(!bad.ok && bad.ignored).toBe(false);
  });
  it("addOneMonth clamps to month end", () => {
    expect(addOneMonth(new Date("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addOneMonth(new Date("2026-10-08T00:00:00Z")).toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });
});
