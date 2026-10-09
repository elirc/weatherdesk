import { describe, expect, it } from "vitest";
import {
  classify,
  colorFor,
  fillColorExpression,
  formatLayerValue,
  isLayerId,
  LAYER_DEFS,
  LAYER_IDS,
  legendItems,
  NO_DATA_COLOR,
} from "@/components/map/layers";

describe("home map layers", () => {
  it("defines the four required layers with consistent breaks/colours", () => {
    expect(LAYER_IDS).toEqual(["rain_today", "tmax_today", "rain_7d", "alerts"]);
    for (const id of LAYER_IDS) {
      const def = LAYER_DEFS[id];
      expect(def.colors.length).toBe(def.breaks.length + 1);
      const sorted = [...def.breaks].sort((a, b) => a - b);
      expect(def.breaks).toEqual(sorted);
    }
  });

  it("classifies values into step classes (lower bound inclusive)", () => {
    const rain = LAYER_DEFS.rain_today; // breaks 1,5,10,25,50
    expect(classify(rain, 0)).toBe(0);
    expect(classify(rain, 1)).toBe(1);
    expect(classify(rain, 9.9)).toBe(2);
    expect(classify(rain, 50)).toBe(5);
    expect(classify(rain, 400)).toBe(5);
    expect(classify(rain, null)).toBe(-1);
    expect(colorFor(rain, null)).toBe(NO_DATA_COLOR);
    expect(colorFor(rain, 60)).toBe(rain.colors[5]);
  });

  it("builds a legend with one row per class plus no-data", () => {
    const rain = legendItems(LAYER_DEFS.rain_today);
    expect(rain.map((l) => l.label)).toEqual([
      "< 1 mm",
      "1–5 mm",
      "5–10 mm",
      "10–25 mm",
      "25–50 mm",
      "≥ 50 mm",
      "no data",
    ]);
    const alerts = legendItems(LAYER_DEFS.alerts);
    expect(alerts.map((l) => l.label)).toEqual(["none", "1", "2", "3+", "no data"]);
  });

  it("emits a MapLibre case/step expression matching the breaks", () => {
    const def = LAYER_DEFS.tmax_today;
    const expr = fillColorExpression(def) as unknown[];
    expect(expr[0]).toBe("case");
    const step = expr[2] as unknown[];
    expect(step[0]).toBe("step");
    expect(step[2]).toBe(def.colors[0]);
    // pairs of (break, colour)
    expect(step.slice(3)).toEqual(def.breaks.flatMap((b, i) => [b, def.colors[i + 1]]));
    expect(expr[3]).toBe(def.noData);
  });

  it("formats hover values with units", () => {
    expect(formatLayerValue(LAYER_DEFS.rain_today, 12.34)).toBe("12.3 mm");
    expect(formatLayerValue(LAYER_DEFS.tmax_today, 38)).toBe("38.0 °C");
    expect(formatLayerValue(LAYER_DEFS.alerts, 1)).toBe("1 advisory");
    expect(formatLayerValue(LAYER_DEFS.alerts, 2)).toBe("2 advisories");
    expect(formatLayerValue(LAYER_DEFS.rain_7d, null)).toBe("no data");
  });

  it("validates layer ids", () => {
    expect(isLayerId("rain_7d")).toBe(true);
    expect(isLayerId("snow")).toBe(false);
  });
});
