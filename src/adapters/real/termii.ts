import type { SmsAdapter } from "../types";

/**
 * STUB — implemented by the pipeline agent (A2). Check current provider docs
 * before implementing; record the doc URL here. Throwing is fine: this driver
 * is only reached when the adapter is switched to real mode.
 */
export const termiiAdapter: SmsAdapter = new Proxy({} as SmsAdapter, {
  get(_t, prop) {
    if (prop === "name") return "termii";
    if (prop === "maxPointsPerCall") return 1;
    return () => {
      throw new Error("Real driver 'termii' not implemented yet");
    };
  },
});
