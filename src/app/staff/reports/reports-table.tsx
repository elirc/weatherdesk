"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Pill } from "../_components/ui";

export type ReportsTableRow = {
  id: string;
  type: "weekly" | "monthly";
  scopeType: "national" | "state" | "custom_area";
  scopeLabel: string;
  organization: string | null;
  period: string;
  periodStart: string;
  status: "draft" | "preliminary" | "final";
  publishedAtMs: number | null;
  publishedLabel: string | null;
  hasPdf: boolean;
  narrativeEdited: boolean;
  corrected: boolean;
};

// TanStack Table v9: features + columns at module scope (stable inputs).
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});
const helper = createColumnHelper<typeof features, ReportsTableRow>();
const STATUS_TONE = { draft: "muted", preliminary: "amber", final: "green" } as const;

const columns = helper.columns([
  helper.accessor("periodStart", {
    header: "Period",
    cell: (c) => (
      <Link href={`/staff/reports/${c.row.original.id}`} className="font-medium underline-offset-2 hover:underline">
        {c.row.original.period}
      </Link>
    ),
  }),
  helper.accessor("type", { header: "Type", cell: (c) => (c.getValue() === "weekly" ? "Weekly" : "Monthly") }),
  helper.accessor("scopeLabel", {
    header: "Scope",
    cell: (c) => (
      <span>
        {c.getValue()} <span className="text-xs text-muted-foreground">({c.row.original.scopeType.replace("_", " ")})</span>
      </span>
    ),
  }),
  helper.accessor("organization", {
    header: "Organisation",
    cell: (c) => (c.getValue() ? <Pill tone="blue">{c.getValue()}</Pill> : <span className="text-muted-foreground">public</span>),
  }),
  helper.accessor("status", { header: "Status", cell: (c) => <Pill tone={STATUS_TONE[c.getValue()]}>{c.getValue()}</Pill> }),
  helper.accessor("publishedAtMs", {
    header: "Published",
    cell: (c) => c.row.original.publishedLabel ?? <Pill tone="red">unpublished</Pill>,
  }),
  helper.accessor("hasPdf", { header: "PDF", cell: (c) => (c.getValue() ? "✓" : "—") }),
  helper.display({
    id: "flags",
    header: "Edits",
    cell: (c) => (
      <span className="flex gap-1">
        {c.row.original.narrativeEdited && <Pill tone="blue">narrative edited</Pill>}
        {c.row.original.corrected && <Pill tone="amber">correction</Pill>}
      </span>
    ),
  }),
]);

export function ReportsTable({ rows }: { rows: ReportsTableRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });
  const pageCount = table.getPageCount();
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id} className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                {g.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} className="px-3 py-2 font-medium" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          <table.FlexRender header={h} />
                          <span aria-hidden>{sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}</span>
                        </button>
                      ) : (
                        <table.FlexRender header={h} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 align-top">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {pagination.pageIndex + 1} of {Math.max(1, pageCount)} · {rows.length} reports
        </span>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  );
}
