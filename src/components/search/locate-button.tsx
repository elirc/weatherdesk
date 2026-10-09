"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Browser geolocation → /place/point?lat=&lon= (rounded to 3 dp). */
export function LocateButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "denied" | "unsupported">("idle");

  function locate() {
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    setState("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(3);
        const lon = pos.coords.longitude.toFixed(3);
        router.push(`/place/point?lat=${lat}&lon=${lon}`);
      },
      () => setState("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={locate} disabled={state === "busy"}>
        <LocateFixed className="size-4" aria-hidden />
        {state === "busy" ? "Finding you…" : "Use my location"}
      </Button>
      {state === "denied" && (
        <p className="text-xs text-muted-foreground">Location unavailable — search for your town instead.</p>
      )}
      {state === "unsupported" && (
        <p className="text-xs text-muted-foreground">This browser cannot share location.</p>
      )}
    </div>
  );
}
