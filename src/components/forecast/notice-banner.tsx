"use client";

import { useState } from "react";
import { Megaphone, X } from "lucide-react";

export type BannerNotice = { id: string; title: string; body: string };

/** Editor notices as a dismissable banner (dismissal is per page view). */
export function NoticeBanner({ notices }: { notices: BannerNotice[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = notices.filter((n) => !hidden.includes(n.id));
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2">
      {visible.map((n) => (
        <div
          key={n.id}
          role="status"
          className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
        >
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">{n.title}</p>
            <p className="whitespace-pre-line">{n.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setHidden((h) => [...h, n.id])}
            className="rounded p-1 hover:bg-sky-100 dark:hover:bg-sky-900"
            aria-label={`Dismiss notice: ${n.title}`}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
