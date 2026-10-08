import { alertRules } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ALERT_SEED } from "@/lib/weather/constants";
import type { SeedStep } from "../lib/seed-types";

/**
 * The four advisory rules with fixed templates. Placeholders: {lga}, {value},
 * {threshold}, {date}. Every template ends with the not-an-official-warning
 * sentence. Skip-if-present per type, so editor edits survive re-seeding.
 */
export const DISCLAIMER = "This is an automatic advisory, not an official warning.";

export const ALERT_RULE_SEED = [
  {
    type: "heavy_rain" as const,
    threshold: ALERT_SEED.heavyRainMmPerDay,
    severity: "moderate" as const,
    template: `Heavy rain of around {value} mm is expected in {lga} on {date}. Flooding of roads and farmland is possible. ${DISCLAIMER}`,
  },
  {
    type: "heat" as const,
    threshold: ALERT_SEED.heatTmaxC,
    severity: "moderate" as const,
    template: `Very hot weather is expected in {lga} on {date}, with temperatures up to around {value}°C. Drink water often, avoid hard work in the afternoon sun and check on children and older people. ${DISCLAIMER}`,
  },
  {
    type: "wind" as const,
    threshold: ALERT_SEED.windGustKmh,
    severity: "moderate" as const,
    template: `Strong wind gusts of around {value} km/h are expected in {lga} on {date}, often with storms. Secure roofing sheets and loose items and keep away from weak trees and poles. ${DISCLAIMER}`,
  },
  {
    type: "dry_spell" as const,
    threshold: ALERT_SEED.drySpellDays,
    severity: "moderate" as const,
    template: `{lga} has had or may have {value} or more days in a row without useful rain (from {date}) during the rainy season. Consider delaying planting and conserving soil moisture. ${DISCLAIMER}`,
  },
];

export const step: SeedStep = {
  name: "alert-rules",
  async run({ db }) {
    const existing = await db.select({ type: alertRules.type }).from(alertRules);
    const have = new Set(existing.map((r) => r.type));
    const missing = ALERT_RULE_SEED.filter((r) => !have.has(r.type));
    if (missing.length) {
      await db.insert(alertRules).values(
        missing.map((r) => ({ id: newId(), ...r, enabled: true, updatedBy: "seed" })),
      );
    }
    return { inserted: missing.length, total: existing.length + missing.length };
  },
};
