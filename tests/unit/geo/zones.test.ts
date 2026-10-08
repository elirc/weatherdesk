import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseStateName, stateMeta } from "@/lib/geo/state-names";
import { STATE_CODES, STATE_ZONES, ZONES, gridCentre, gridIdx } from "@/lib/geo/zones";

const adm1 = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../data/boundaries/raw/nga-adm1-simplified.geojson"), "utf8"),
) as { features: { properties: { shapeName: string; shapeISO: string } }[] };

describe("state → zone mapping", () => {
  it("covers 36 states + FCT, with matching code table", () => {
    expect(Object.keys(STATE_ZONES)).toHaveLength(37);
    expect(new Set(Object.keys(STATE_CODES))).toEqual(new Set(Object.keys(STATE_ZONES)));
    expect(new Set(Object.values(STATE_CODES)).size).toBe(37);
  });

  it("puts states in all six zones with the official counts", () => {
    const perZone = Object.fromEntries(ZONES.map((z) => [z, 0]));
    for (const z of Object.values(STATE_ZONES)) perZone[z] += 1;
    expect(perZone).toEqual({
      "north-west": 7,
      "north-east": 6,
      "north-central": 7, // 6 states + FCT
      "south-west": 6,
      "south-east": 5,
      "south-south": 6,
    });
  });

  it("maps every shapeName in the committed ADM1 file, and ISO codes agree", () => {
    expect(adm1.features).toHaveLength(37);
    const seen = new Set<string>();
    for (const f of adm1.features) {
      const meta = stateMeta(f.properties.shapeName);
      seen.add(meta.name);
      if (f.properties.shapeISO) expect(meta.code).toBe(f.properties.shapeISO);
    }
    expect(seen.size).toBe(37);
  });

  it.each([
    ["Abuja Federal Capital Territory", "Federal Capital Territory"],
    ["Federal Capital Territory", "Federal Capital Territory"],
    ["FCT", "Federal Capital Territory"],
    ["Nassarawa", "Nasarawa"],
    ["Lagos State", "Lagos"],
    ["  cross   river ", "Cross River"],
    ["akwa ibom", "Akwa Ibom"],
  ])("normalises %j", (raw, canonical) => {
    expect(normaliseStateName(raw)).toBe(canonical);
  });

  it("rejects unknown names", () => {
    expect(normaliseStateName("Atlantis")).toBeNull();
    expect(() => stateMeta("Atlantis")).toThrow(/Unknown/);
  });
});

describe("grid helpers", () => {
  it("0.1° cells with centre at idx/10 + 0.05", () => {
    expect(gridIdx(6.6018)).toBe(66);
    expect(gridIdx(3.3515)).toBe(33);
    expect(gridCentre(66)).toBeCloseTo(6.65, 10);
  });
});
