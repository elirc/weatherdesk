import { describe, expect, it } from "vitest";
import { slugify, uniqueLgaSlugs } from "@/lib/geo/slug";

describe("slugify", () => {
  it.each([
    ["Akwa Ibom", "akwa-ibom"],
    ["Federal Capital Territory", "federal-capital-territory"],
    ["Jama'are", "jamaare"],
    ["Jema'A", "jemaa"],
    ["Obio/Akpor", "obio-akpor"],
    ["Port-Harcourt", "port-harcourt"],
    ["  Ado  Ekiti ", "ado-ekiti"],
    ["Ọ̀yọ́", "oyo"],
    ["Ife Central & East", "ife-central-and-east"],
  ])("%s → %s", (input, out) => {
    expect(slugify(input)).toBe(out);
  });
});

describe("uniqueLgaSlugs", () => {
  it("keeps unique names bare", () => {
    expect(uniqueLgaSlugs([{ name: "Ikeja", stateSlug: "lagos" }])).toEqual(["ikeja"]);
  });

  it("suffixes EVERY colliding LGA with its state slug, order-independent", () => {
    const input = [
      { name: "Surulere", stateSlug: "lagos" },
      { name: "Ikeja", stateSlug: "lagos" },
      { name: "Surulere", stateSlug: "oyo" },
      { name: "Obi", stateSlug: "benue" },
      { name: "Obi", stateSlug: "nasarawa" },
    ];
    const a = uniqueLgaSlugs(input);
    expect(a).toEqual(["surulere-lagos", "ikeja", "surulere-oyo", "obi-benue", "obi-nasarawa"]);
    const b = uniqueLgaSlugs([...input].reverse());
    expect(new Set(b)).toEqual(new Set(a));
  });

  it("falls back to a numeric suffix for duplicates within one state", () => {
    expect(
      uniqueLgaSlugs([
        { name: "Bassa", stateSlug: "kogi" },
        { name: "Bassa", stateSlug: "kogi" },
      ]),
    ).toEqual(["bassa-kogi", "bassa-kogi-2"]);
  });

  it("treats names that slug identically as collisions", () => {
    expect(
      uniqueLgaSlugs([
        { name: "Ife Central", stateSlug: "osun" },
        { name: "Ife-Central", stateSlug: "ondo" },
      ]),
    ).toEqual(["ife-central-osun", "ife-central-ondo"]);
  });
});
