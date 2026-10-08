import type { HistoryAdapter } from "../types";

/**
 * STUB — implemented by the pipeline agent (A2). Check current provider docs
 * before implementing; record the doc URL here. Throwing is fine: this driver
 * is only reached when the adapter is switched to real mode.
 */
export const nasaPowerAdapter: HistoryAdapter = new Proxy({} as HistoryAdapter, {
  get(_t, prop) {
    if (prop === "name") return "nasa-power";
    if (prop === "maxPointsPerCall") return 1;
    return () => {
      throw new Error("Real driver 'nasa-power' not implemented yet");
    };
  },
});
