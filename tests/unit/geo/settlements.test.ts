import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseStateName } from "@/lib/geo/state-names";
import { inNigeriaBbox, STATE_ZONES } from "@/lib/geo/zones";
import { escapeLike, matchKey, normaliseQuery } from "@/lib/geo/query-text";
import { parseCsv, toSettlementRows } from "../../../scripts/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM, blank and comment lines", () => {
    const text = '﻿name,state,lat,lon,kind\r\n"Ife, Ile",Osun,7.48,4.56,city\r\n\r\n# note,,,,\r\n"Say ""hi""",Lagos,6.5,3.3,\r\n';
    expect(parseCsv(text)).toEqual([
      { name: "Ife, Ile", state: "Osun", lat: "7.48", lon: "4.56", kind: "city" },
      { name: 'Say "hi"', state: "Lagos", lat: "6.5", lon: "3.3", kind: "" },
    ]);
  });

  it("rejects rows without coordinates", () => {
    const { rows, rejects } = toSettlementRows([
      { name: "A", state: "Lagos", lat: "6.5", lon: "3.3", kind: "" },
      { name: "B", state: "Lagos", lat: "", lon: "3.3", kind: "" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBeNull();
    expect(rejects).toHaveLength(1);
  });
});

describe("settlements fixture", () => {
  const text = readFileSync(
    path.resolve(__dirname, "../../../data/settlements/settlements-fixture.csv"),
    "utf8",
  );
  const { rows, rejects } = toSettlementRows(parseCsv(text));

  it("has 300+ valid rows inside Nigeria", () => {
    expect(rejects).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(300);
    for (const r of rows) expect(inNigeriaBbox(r.lat, r.lon), r.name).toBe(true);
  });

  it("covers every state with a capital, using known state names", () => {
    const states = new Set(rows.map((r) => normaliseStateName(r.state)));
    expect(states.has(null)).toBe(false);
    expect(states.size).toBe(Object.keys(STATE_ZONES).length);
    const capitals = rows.filter((r) => r.kind === "capital");
    expect(new Set(capitals.map((r) => r.state)).size).toBe(37);
  });

  it("has no duplicate name within a state", () => {
    const keys = rows.map((r) => `${r.name}|${r.state}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("search input handling", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
  it("normalises queries", () => {
    expect(normaliseQuery("  Kaduna   State ")).toBe("Kaduna");
    expect(normaliseQuery("Ikeja LGA")).toBe("Ikeja");
    expect(normaliseQuery("x".repeat(200))).toHaveLength(80);
  });
});

describe("matchKey", () => {
  it("ignores case, hyphens, slashes and apostrophes", () => {
    expect(matchKey("Port-Harcourt")).toBe("port harcourt");
    expect(matchKey("Obio/Akpor")).toBe("obio akpor");
    expect(matchKey("Jema'A")).toBe("jemaa");
    expect(matchKey("100%_")).toBe("100");
  });
});
