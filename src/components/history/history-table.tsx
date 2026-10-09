"use client";

import { useState } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type PaginationState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

export type HistoryRow = {
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  source: string;
  preliminary: boolean;
};

export const HISTORY_PAGE_SIZE = 31;

// TanStack Table v9: features + columns at module scope (stable inputs).
const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
const helper = createColumnHelper<typeof features, HistoryRow>();
const num = (v: number | null, unit: string) => (v == null ? "—" : `${v.toFixed(1)} ${unit}`);
const SOURCE: Record<string, string> = { nasa_power: "NASA POWER", model_estimate: "model estimate" };

const columns = helper.columns([
  helper.accessor("date", { header: "Date" }),
  helper.accessor("rainMm", { header: "Rain", cell: (c) => num(c.getValue(), "mm") }),
  helper.accessor("tmaxC", { header: "Max", cell: (c) => num(c.getValue(), "°C") }),
  helper.accessor("tminC", { header: "Min", cell: (c) => num(c.getValue(), "°C") }),
  helper.accessor("source", {
    header: "Source",
    cell: (c) => {
      const label = SOURCE[c.getValue()] ?? c.getValue();
      return c.row.original.preliminary ? `${label} (preliminary)` : label;
    },
  }),
]);

/** Newest first, 31 rows per page. */
export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [data] = useState(() => [...rows].reverse());
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: HISTORY_PAGE_SIZE });
  const table = useTable({
    features,
    columns,
    data,
    state: { pagination },
    onPaginationChange: setPagination,
  });
  const pageCount = table.getPageCount();
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id} className="border-b text-left text-xs text-muted-foreground">
                {g.headers.map((h) => (
                  <th key={h.id} className="py-2 pr-2 font-medium">
                    {h.isPlaceholder ? null : <table.FlexRender header={h} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={`border-b last:border-0 ${row.original.preliminary ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="py-1.5 pr-2 tabular-nums">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Newer
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.pageIndex + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
