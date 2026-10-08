import type { ForecastAdapter } from "../types";

/**
 * STUB — implemented by the pipeline agent (A2). Check current provider docs
 * before implementing; record the doc URL here. Throwing is fine: this driver
 * is only reached when the adapter is switched to real mode.
 */
export const openMeteoAdapter: ForecastAdapter = new Proxy({} as ForecastAdapter, {
  get(_t, prop) {
    if (prop === "name") return "open-meteo";
    if (prop === "maxPointsPerCall") return 1;
    return () => {
      throw new Error("Real driver 'open-meteo' not implemented yet");
    };
  },
});
