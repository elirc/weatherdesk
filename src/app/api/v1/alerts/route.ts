import { findLga, findStateByCode, listApiAlerts } from "@/lib/api/data";
import { apiOptions, withApi } from "@/lib/api/guard";
import { alertsParams, searchParamsObject } from "@/lib/api/params";
import { ApiHttpError, envelope, zodMessage } from "@/lib/api/respond";

/**
 * GET /api/v1/alerts?state=NG-XX | lga=<code|slug>  [&active=true|false]
 * Automatic advisories — NOT official warnings (every item has official:false).
 */
export async function GET(request: Request) {
  return withApi(request, "alerts", async () => {
    const parsed = alertsParams.safeParse(searchParamsObject(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiHttpError("bad_request", zodMessage(parsed.error.issues));
    const q = parsed.data;
    let stateId: number | undefined;
    let lgaId: number | undefined;
    if (q.state) {
      const s = await findStateByCode(q.state);
      if (!s) throw new ApiHttpError("not_found", `No state with code ${q.state}`);
      stateId = s.id;
    }
    if (q.lga) {
      const l = await findLga(q.lga);
      if (!l) throw new ApiHttpError("not_found", `No LGA with code or slug "${q.lga}"`);
      lgaId = l.id;
    }
    const { data, newest } = await listApiAlerts({ stateId, lgaId, active: q.active });
    const body = envelope(data, {
      source: "computed",
      fetchedAt: newest,
      count: data.length,
      disclaimer: "Automatic advisories from forecast thresholds. Not official warnings; not affiliated with NiMet.",
    });
    return { body };
  });
}

export const OPTIONS = apiOptions;
