"use client";

import { Button } from "@/components/ui/button";
import { useStaffAction } from "../../_components/use-action";
import { retryJobAction, triggerJobAction } from "./actions";

export function RunNowButtons({ jobs }: { jobs: { key: string; label: string }[] }) {
  const [trigger, pending] = useStaffAction(triggerJobAction, (d) => `Queued${d?.jobId ? ` (job ${d.jobId.slice(0, 8)})` : " (already queued)"}`);
  return (
    <div className="flex flex-wrap gap-2">
      {jobs.map((j) => (
        <Button
          key={j.key}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Queue "${j.label}" now? The worker will execute it against live data.`)) trigger({ key: j.key });
          }}
        >
          {j.label}
        </Button>
      ))}
    </div>
  );
}

export function RetryButton({ runId, disabledReason }: { runId: number; disabledReason: string | null }) {
  const [retry, pending] = useStaffAction(retryJobAction, "Retry queued");
  if (disabledReason) {
    return (
      <span title={disabledReason} className="inline-block">
        <Button size="sm" variant="outline" disabled aria-label={`Retry unavailable: ${disabledReason}`}>
          Retry
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => retry({ runId })}>
      Retry
    </Button>
  );
}
