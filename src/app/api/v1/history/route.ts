import { findLga } from "@/lib/api/data";
import { apiOptions, withApi } from "@/lib/api/guard";
import { historyParams, searchParamsObject } from "@/lib/api/params";
import { ApiHttpError, envelope, zodMessage } from "@/lib/api/respond";
import { getObservedRange } from "@/server/queries/climate";

/**
 * GET /api/v1/history?lga=<code|slug>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Observed daily values (max 1 year per request). NASA POWER rows are
 * final; model-estimate rows are flagged preliminary.
 */
export async function GET(request: Request) {
  return withApi(request, "history", async () => {
    const parsed = historyParams.safeParse(searchParamsObject(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiHttpError("bad_request", zodMessage(parsed.error.issues));
    const { lga: ref, from, to } = parsed.data;
    const lga = await findLga(ref);
    if (!lga) throw new ApiHttpError("not_found", `No LGA with code or slug "${ref}"`);
    if (lga.gridCellId == null) throw new ApiHttpError("not_found", "No history coverage for this LGA yet.");
    const rows = await getObservedRange(lga.gridCellId, from, to);
    const newest = rows.reduce<Date | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);
    const sources = [...new Set(rows.map((r) => r.source))];
    const body = envelope(
      {
        place: { kind: "lga", code: lga.code, slug: lga.slug, name: lga.name, state: { code: lga.stateCode, name: lga.stateName } },
        from,
        to,
        days: rows.map((r) => ({
          date: r.date,
          rainMm: r.rainMm,
          tmaxC: r.tmaxC,
          tminC: r.tminC,
          humidityPct: r.humidityPct,
          windKmh: r.windKmh,
          source: r.source,
          preliminary: r.preliminary,
        })),
      },
      { source: sources.join(",") || "none", fetchedAt: newest },
    );
    return { body };
  });
}

export const OPTIONS = apiOptions;
