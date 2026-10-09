"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStaffAction } from "../../_components/use-action";
import { Pill } from "../../_components/ui";
import {
  publishReportAction,
  regenerateReportAction,
  rerenderPdfAction,
  saveCorrectionAction,
  saveNarrativeAction,
  unpublishReportAction,
} from "../actions";

type Props = {
  report: {
    id: string;
    type: "weekly" | "monthly";
    status: "draft" | "preliminary" | "final";
    published: boolean;
    narrative: string;
    generatedNarrative: string | null;
    correctionNote: string;
    branded: boolean;
  };
};

export function ReportEditor({ report }: Props) {
  const [narrative, setNarrative] = useState(report.narrative);
  const [correction, setCorrection] = useState(report.correctionNote);
  const [saveNarrative, savingNarrative] = useStaffAction(saveNarrativeAction, "Narrative saved");
  const [saveCorrection, savingCorrection] = useStaffAction(saveCorrectionAction, "Correction note saved");
  const [publish, publishing] = useStaffAction(publishReportAction, "Report published");
  const [unpublish, unpublishing] = useStaffAction(unpublishReportAction, "Report unpublished");
  const [regenerate, regenerating] = useStaffAction(regenerateReportAction, "Regeneration queued — the worker will update this report shortly");
  const [rerender, rerendering] = useStaffAction(rerenderPdfAction, "PDF re-render queued");

  const edited = report.generatedNarrative != null && report.narrative !== report.generatedNarrative;
  const dirty = narrative !== report.narrative;
  const canPromote = report.type === "monthly" && report.status === "preliminary";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="space-y-2 rounded-lg border p-4 lg:col-span-2" aria-labelledby="narrative-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="narrative-title" className="font-semibold">
            Narrative
          </h2>
          {edited ? <Pill tone="blue">edited by an editor</Pill> : <Pill>template text</Pill>}
        </div>
        <Label htmlFor="narrative" className="sr-only">
          Narrative
        </Label>
        <Textarea id="narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={10} className="text-sm leading-relaxed" />
        <p className="text-xs text-muted-foreground">
          Blank lines separate paragraphs. Edited text survives regeneration; the numbers in the stats and tables always come from the computed content.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!dirty || savingNarrative} onClick={() => saveNarrative({ id: report.id, narrative })}>
            {savingNarrative ? "Saving…" : "Save narrative"}
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setNarrative(report.narrative)}>
              Discard changes
            </Button>
          )}
          {report.generatedNarrative != null && narrative !== report.generatedNarrative && (
            <Button size="sm" variant="outline" onClick={() => setNarrative(report.generatedNarrative ?? "")}>
              Load template text
            </Button>
          )}
        </div>
      </section>

      <div className="space-y-4">
        <section className="space-y-2 rounded-lg border p-4" aria-labelledby="publish-title">
          <h2 id="publish-title" className="font-semibold">
            Publishing
          </h2>
          <p className="text-sm text-muted-foreground">
            {report.published ? "Published" : "Not published"} · status <strong>{report.status}</strong>
            {report.branded && " · branded copy (never on public pages)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {!report.published && (
              <Button size="sm" disabled={publishing} onClick={() => publish({ id: report.id, promoteToFinal: false })}>
                Publish
              </Button>
            )}
            {canPromote && (
              <Button size="sm" variant={report.published ? "default" : "outline"} disabled={publishing} onClick={() => publish({ id: report.id, promoteToFinal: true })}>
                {report.published ? "Mark final (reviewed)" : "Publish as final"}
              </Button>
            )}
            {report.published && (
              <Button
                size="sm"
                variant="destructive"
                disabled={unpublishing}
                onClick={() => {
                  if (window.confirm("Unpublish this report? It disappears from the public site until republished.")) unpublish({ id: report.id });
                }}
              >
                Unpublish
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-2 rounded-lg border p-4" aria-labelledby="correction-title">
          <h2 id="correction-title" className="font-semibold">
            Correction note
          </h2>
          <Label htmlFor="correction" className="sr-only">
            Correction note
          </Label>
          <Textarea
            id="correction"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            placeholder="Shown at the top of the public report, e.g. “Corrected 9 Oct: Kano rainfall total revised.” Leave empty to clear."
            className="text-sm"
          />
          <Button size="sm" variant="outline" disabled={correction === report.correctionNote || savingCorrection} onClick={() => saveCorrection({ id: report.id, correctionNote: correction })}>
            {correction.trim() === "" && report.correctionNote ? "Clear correction" : "Save correction"}
          </Button>
        </section>

        <section className="space-y-2 rounded-lg border p-4" aria-labelledby="engine-title">
          <h2 id="engine-title" className="font-semibold">
            Engine
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={regenerating} onClick={() => regenerate({ id: report.id })}>
              Regenerate
            </Button>
            <Button size="sm" variant="outline" disabled={rerendering} onClick={() => rerender({ id: report.id })}>
              Re-render PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Regenerate recomputes content from the latest data (editor narrative is kept) and re-renders the PDF.
            {!report.published && " Note: the engine publishes reports it generates, so regenerating will make this report public again."}
          </p>
        </section>
      </div>
    </div>
  );
}
