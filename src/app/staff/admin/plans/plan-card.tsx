"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStaffAction } from "../../_components/use-action";
import { Pill } from "../../_components/ui";
import { updatePlanAction } from "./actions";

type Plan = {
  id: string;
  name: string;
  kind: string;
  priceLabel: string;
  priceNaira: number;
  apiCallsPerDay: number;
  customAreas: number;
  downloads: boolean;
  brandedReports: boolean;
  active: boolean;
  otherLimits: Record<string, unknown>;
  paystackPlanCode: string | null;
};

export function PlanCard({ plan }: { plan: Plan }) {
  const [price, setPrice] = useState(String(plan.priceNaira));
  const [apiCalls, setApiCalls] = useState(String(plan.apiCallsPerDay));
  const [areas, setAreas] = useState(String(plan.customAreas));
  const [downloads, setDownloads] = useState(plan.downloads);
  const [branded, setBranded] = useState(plan.brandedReports);
  const [active, setActive] = useState(plan.active);
  const [save, saving] = useStaffAction(updatePlanAction, `${plan.name} saved`);
  const id = (f: string) => `${plan.id}-${f}`;
  const dirty =
    Number(price) !== plan.priceNaira ||
    Number(apiCalls) !== plan.apiCallsPerDay ||
    Number(areas) !== plan.customAreas ||
    downloads !== plan.downloads ||
    branded !== plan.brandedReports ||
    active !== plan.active;
  const invalid = [price, apiCalls, areas].some((v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0);

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby={id("title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id("title")} className="font-semibold">
          {plan.name} <span className="font-mono text-xs text-muted-foreground">{plan.id}</span>
        </h2>
        <span className="flex gap-1">
          <Pill>{plan.kind.replace("_", " ")}</Pill>
          <Pill tone="blue">{plan.priceLabel}/month</Pill>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label htmlFor={id("price")} className="text-xs text-muted-foreground">
            Price (₦ / month)
          </label>
          <Input id={id("price")} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" />
        </div>
        <div className="grid gap-1">
          <label htmlFor={id("api")} className="text-xs text-muted-foreground">
            API calls / day
          </label>
          <Input id={id("api")} type="number" min={0} step={1} value={apiCalls} onChange={(e) => setApiCalls(e.target.value)} className="h-9" />
        </div>
        <div className="grid gap-1">
          <label htmlFor={id("areas")} className="text-xs text-muted-foreground">
            Custom areas
          </label>
          <Input id={id("areas")} type="number" min={0} step={1} value={areas} onChange={(e) => setAreas(e.target.value)} className="h-9" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Switch checked={downloads} onCheckedChange={setDownloads} aria-label="Downloads" /> Downloads
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={branded} onCheckedChange={setBranded} aria-label="Branded reports" /> Branded reports
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} aria-label="Plan active" /> Active
        </label>
      </div>
      {Object.keys(plan.otherLimits).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Other limits (kept as-is): <code>{JSON.stringify(plan.otherLimits)}</code>
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Paystack plan: {plan.paystackPlanCode ?? "not synced"}</p>
        <Button
          size="sm"
          disabled={!dirty || invalid || saving}
          onClick={() =>
            save({
              id: plan.id,
              priceNaira: Number(price),
              apiCallsPerDay: Number(apiCalls),
              customAreas: Number(areas),
              downloads,
              brandedReports: branded,
              active,
            })
          }
        >
          {saving ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </section>
  );
}
