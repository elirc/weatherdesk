import { cn } from "@/lib/utils";

/** Native <select> styled like shadcn inputs (reliable in plain GET forms + FormData). */
export const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Pill({ tone = "muted", children }: { tone?: "muted" | "green" | "red" | "amber" | "blue"; children: React.ReactNode }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    red: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    blue: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  } as const;
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function TableSkeleton() {
  return <div className="h-80 animate-pulse rounded-lg bg-muted" />;
}

export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-muted-foreground">{total} row(s)</p>;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      {page > 1 ? (
        <a className="underline" href={hrefFor(page - 1)}>
          ← Newer
        </a>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Page {page} of {pages} · {total} rows
      </span>
      {page < pages ? (
        <a className="underline" href={hrefFor(page + 1)}>
          Older →
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Build a query string from defined values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
