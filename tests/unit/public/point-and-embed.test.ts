import { describe, expect, it } from "vitest";
import { embedSnippet, widgetPath } from "@/components/forecast/embed-snippet";
import { placeTabs } from "@/app/(public)/place/tab-bar";
import {
  formatCoords,
  parsePointKey,
  parsePointParams,
  pointKey,
  round3,
} from "@/app/(public)/place/point-params";

describe("point params", () => {
  it("accepts in-Nigeria points and rounds to 3 dp", () => {
    expect(parsePointParams({ lat: "6.52437", lon: "3.37921" })).toEqual({ ok: true, lat: 6.524, lon: 3.379 });
    expect(parsePointParams({ lat: ["9.0765", "1"], lon: "7.3986" })).toEqual({ ok: true, lat: 9.077, lon: 7.399 });
  });

  it("rejects missing, non-numeric and out-of-bbox points", () => {
    expect(parsePointParams({}).ok).toBe(false);
    expect(parsePointParams({ lat: "abc", lon: "3" }).ok).toBe(false);
    const london = parsePointParams({ lat: "51.5", lon: "-0.12" });
    expect(london.ok).toBe(false);
    if (!london.ok) expect(london.error).toMatch(/outside Nigeria/);
  });

  it("round-trips point keys", () => {
    expect(pointKey(6.52437, 3.37921)).toBe("6.524,3.379");
    expect(parsePointKey("6.524,3.379")).toEqual({ lat: 6.524, lon: 3.379 });
    expect(parsePointKey("nonsense")).toBeNull();
    expect(round3(1.23456)).toBe(1.235);
  });

  it("formats coordinates", () => {
    expect(formatCoords(6.5244, 3.3792)).toBe("6.524° N, 3.379° E");
  });
});

describe("embed snippet", () => {
  it("builds an iframe pointing at the widget route", () => {
    const s = embedSnippet({ origin: "https://wd.example/", kind: "lga", id: "ikeja", name: "Ikeja" });
    expect(s).toContain('src="https://wd.example/widget/lga/ikeja"');
    expect(s).toContain('title="Ikeja weather — WeatherDesk"');
    expect(s).toMatch(/^<iframe .*><\/iframe>$/);
  });

  it("escapes attribute content", () => {
    const s = embedSnippet({ origin: "https://x", kind: "settlement", id: 5, name: 'A "quoted" <town>' });
    expect(s).not.toContain('"quoted"');
    expect(s).toContain("&quot;quoted&quot; &lt;town&gt;");
    expect(widgetPath("state", "cross river")).toBe("/widget/state/cross%20river");
  });
});

describe("place tabs", () => {
  it("links climate/history/farming under the place base", () => {
    const tabs = placeTabs({ basePath: "/place/lga/ikeja", tabBasePath: "/place/lga/ikeja" });
    expect(tabs.map((t) => t.href)).toEqual([
      "/place/lga/ikeja",
      "/place/lga/ikeja/climate",
      "/place/lga/ikeja/history",
      "/place/lga/ikeja/farming",
    ]);
  });

  it("hides sub-tabs for points outside any LGA", () => {
    const tabs = placeTabs({ basePath: "/place/point?lat=6&lon=3", tabBasePath: null });
    expect(tabs.map((t) => t.id)).toEqual(["forecast"]);
  });
});
