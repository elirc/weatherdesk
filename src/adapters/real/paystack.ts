import type { PaymentsAdapter } from "../types";

/**
 * STUB — implemented by the pipeline agent (A2). Check current provider docs
 * before implementing; record the doc URL here. Throwing is fine: this driver
 * is only reached when the adapter is switched to real mode.
 */
export const paystackAdapter: PaymentsAdapter = new Proxy({} as PaymentsAdapter, {
  get(_t, prop) {
    if (prop === "name") return "paystack";
    if (prop === "maxPointsPerCall") return 1;
    return () => {
      throw new Error("Real driver 'paystack' not implemented yet");
    };
  },
});
