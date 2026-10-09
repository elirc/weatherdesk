"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useStaffAction } from "../_components/use-action";
import { selectClass } from "../_components/ui";
import {
  SAMPLE_TEMPLATE_VALUES,
  renderTemplatePreview,
  unknownPlaceholders,
  validateThreshold,
  type AlertType,
} from "../_lib/policy";
import { updateAlertRuleAction } from "./actions";

type Rule = {
  id: string;
  type: AlertType;
  threshold: number;
  severity: "moderate" | "high";
  enabled: boolean;
  template: string;
};

export function AlertRuleCard({
  rule,
  range,
  updatedLabel,
}: {
  rule: Rule;
  range: { min: number; max: number; unit: string; label: string };
  updatedLabel: string;
}) {
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [severity, setSeverity] = useState(rule.severity);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [template, setTemplate] = useState(rule.template);
  const [save, saving] = useStaffAction(updateAlertRuleAction, `${range.label} rule saved`);

  const num = Number(threshold);
  const check = threshold.trim() === "" ? { ok: false as const, error: "Threshold is required" } : validateThreshold(rule.type, num);
  const unknown = unknownPlaceholders(template);
  const dirty =
    num !== rule.threshold || severity !== rule.severity || enabled !== rule.enabled || template !== rule.template;
  const sample = SAMPLE_TEMPLATE_VALUES[rule.type];
  const preview = renderTemplatePreview(template, { ...sample, threshold: threshold || "?" });
  const fieldId = (f: string) => `${rule.id}-${f}`;

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby={fieldId("title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={fieldId("title")} className="font-semibold">
          {range.label}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Rule enabled" />
          {enabled ? "Enabled" : "Disabled"}
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1">
          <label htmlFor={fieldId("threshold")} className="text-xs text-muted-foreground">
            Threshold ({range.unit}, {range.min}–{range.max})
          </label>
          <Input
            id={fieldId("threshold")}
            type="number"
            inputMode="decimal"
            min={range.min}
            max={range.max}
            step={rule.type === "dry_spell" ? 1 : 0.5}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-invalid={!check.ok}
            className="h-9 w-32"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={fieldId("severity")} className="text-xs text-muted-foreground">
            Severity
          </label>
          <select
            id={fieldId("severity")}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Rule["severity"])}
            className={selectClass}
          >
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      {!check.ok && <p className="text-sm text-destructive">{check.error}</p>}
      <div className="grid gap-1">
        <label htmlFor={fieldId("template")} className="text-xs text-muted-foreground">
          Advisory template
        </label>
        <Textarea id={fieldId("template")} value={template} onChange={(e) => setTemplate(e.target.value)} rows={3} className="text-sm" />
        {unknown.length > 0 && <p className="text-sm text-destructive">Unknown placeholder(s): {unknown.join(", ")}</p>}
      </div>
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Preview with sample values: </span>
        {preview}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Last updated {updatedLabel}</p>
        <Button
          size="sm"
          disabled={!dirty || !check.ok || unknown.length > 0 || saving}
          onClick={() => save({ id: rule.id, type: rule.type, threshold: num, severity, enabled, template })}
        >
          {saving ? "Saving…" : "Save rule"}
        </Button>
      </div>
    </section>
  );
}
