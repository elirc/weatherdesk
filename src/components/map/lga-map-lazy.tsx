"use client";

import dynamic from "next/dynamic";
import type { MapLayerId } from "./layers";

/** Client-only, lazily loaded map (MapLibre needs `window`; keeps it out of SSR). */
const LgaMap = dynamic(() => import("./lga-map").then((m) => m.LgaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[452px] w-full items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground sm:h-[552px]">
      Loading map…
    </div>
  ),
});

export function LgaMapLazy(props: { styleUrl?: string; initialLayer?: MapLayerId }) {
  return <LgaMap {...props} />;
}
