import { findStateByCode, listApiReports } from "@/lib/api/data";
import { apiOptions, withApi } from "@/lib/api/guard";
import { reportsParams, searchParamsObject } from "@/lib/api/params";
import { ApiHttpError, envelope, zodMessage } from "@/lib/api/respond";

/** GET /api/v1/reports?type=weekly|monthly&scope=national|NG-XX&limit=10 — published reports with PDF URLs. */
export async function GET(request: Request) {
  return withApi(request, "reports", async () => {
    const parsed = reportsParams.safeParse(searchParamsObject(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiHttpError("bad_request", zodMessage(parsed.error.issues));
    const q = parsed.data;
    let stateId: number | undefined;
    if (q.scope && q.scope !== "national") {
      const s = await findStateByCode(q.scope);
      if (!s) throw new ApiHttpError("not_found", `No state with code ${q.scope}`);
      stateId = s.id;
    }
    const { data, newest } = await listApiReports({
      type: q.type,
      national: q.scope === "national",
      stateId,
      limit: q.limit,
    });
    return { body: envelope(data, { source: "weatherdesk-reports", fetchedAt: newest, count: data.length }) };
  });
}

export const OPTIONS = apiOptions;
