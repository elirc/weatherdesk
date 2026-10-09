import { findLga } from "@/lib/api/data";
import { apiOptions, withApi } from "@/lib/api/guard";
import { normalsParams, searchParamsObject } from "@/lib/api/params";
import { ApiHttpError, envelope, zodMessage } from "@/lib/api/respond";
import { NORMALS_END_YEAR, NORMALS_START_YEAR } from "@/lib/weather/constants";
import { getMonthlyNormals, getSeasonNormal } from "@/server/queries/climate";

/** GET /api/v1/normals?lga=<code|slug> — 1991–2020 monthly normals + rainy-season onset/cessation. */
export async function GET(request: Request) {
  return withApi(request, "normals", async () => {
    const parsed = normalsParams.safeParse(searchParamsObject(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiHttpError("bad_request", zodMessage(parsed.error.issues));
    const lga = await findLga(parsed.data.lga);
    if (!lga) throw new ApiHttpError("not_found", `No LGA with code or slug "${parsed.data.lga}"`);
    if (lga.gridCellId == null) throw new ApiHttpError("not_found", "No normals for this LGA yet.");
    const [monthly, season] = await Promise.all([getMonthlyNormals(lga.gridCellId), getSeasonNormal(lga.gridCellId)]);
    if (!monthly.length) throw new ApiHttpError("not_found", "No normals for this LGA yet.");
    const body = envelope(
      {
        place: { kind: "lga", code: lga.code, slug: lga.slug, name: lga.name, state: { code: lga.stateCode, name: lga.stateName } },
        period: { startYear: NORMALS_START_YEAR, endYear: NORMALS_END_YEAR },
        monthly,
        season,
      },
      { source: "computed (nasa-power)", fetchedAt: null },
    );
    return { body };
  });
}

export const OPTIONS = apiOptions;
