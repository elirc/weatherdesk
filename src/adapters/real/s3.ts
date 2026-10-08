import type { StorageAdapter } from "../types";

/**
 * STUB — implemented by the pipeline agent (A2). Check current provider docs
 * before implementing; record the doc URL here. Throwing is fine: this driver
 * is only reached when the adapter is switched to real mode.
 */
export const s3StorageAdapter: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_t, prop) {
    if (prop === "name") return "s3";
    if (prop === "maxPointsPerCall") return 1;
    return () => {
      throw new Error("Real driver 's3' not implemented yet");
    };
  },
});
