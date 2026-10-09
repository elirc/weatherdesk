import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthzError, requireUser } from "@/lib/authz";
import { lagosToday } from "@/lib/time";
import { historyCsvFilename, historyCsvHeader, historyCsvRow } from "@/components/history/csv";
import { resolveHistoryRange } from "@/components/history/range";
import { getObservedRange } from "@/server/queries/climate";

/**
 * GET /api/downloads/history.csv?cell=<gridCellId>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Signed-in users only (free account is enough). Signed-out → redirect to
 * /sign-in?next=<this url>. Range validated + clamped exactly like the
 * history tab (≥ 1991-01-01, ≤ yesterday Lagos, ≤ 5 years). Streams CSV
 * (RFC 4180, CRLF) in chunks with source + preliminary columns.
 */

const cellSchema = z.coerce.number().int().positive().max(2_000_000_000);
const CHUNK_ROWS = 200;

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthzError) {
      const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
      const url = new URL("/sign-in", req.nextUrl.origin);
      url.searchParams.set("next", next);
      return NextResponse.redirect(url, 303);
    }
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  const cell = cellSchema.safeParse(sp.get("cell"));
  if (!cell.success) {
    return NextResponse.json({ error: "cell must be a grid cell id" }, { status: 400 });
  }
  const range = resolveHistoryRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, lagosToday());
  const rows = await getObservedRange(cell.data, range.from, range.to);

  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(historyCsvHeader()));
    },
    pull(controller) {
      if (i >= rows.length) {
        controller.close();
        return;
      }
      const end = Math.min(rows.length, i + CHUNK_ROWS);
      let chunk = "";
      for (; i < end; i++) chunk += historyCsvRow(rows[i]);
      controller.enqueue(encoder.encode(chunk));
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${historyCsvFilename(cell.data, range.from, range.to)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
