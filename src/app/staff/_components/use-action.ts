"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/authz";

/**
 * Run a staff Server Action, toast the outcome and refresh the route on
 * success. Returns [run, pending].
 */
export function useStaffAction<A extends unknown[], T = undefined>(
  action: (...args: A) => Promise<ActionResult<T>>,
  successMessage: string | ((data: T | undefined) => string),
  onSuccess?: (data: T | undefined) => void,
): [(...args: A) => void, boolean] {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (...args: A) =>
    start(async () => {
      try {
        const res = await action(...args);
        if (res.ok) {
          toast.success(typeof successMessage === "function" ? successMessage(res.data) : successMessage);
          onSuccess?.(res.data);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch {
        toast.error("Something went wrong. Try again.");
      }
    });
  return [run, pending];
}
