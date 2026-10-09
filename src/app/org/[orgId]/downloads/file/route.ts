import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthzError, requireOrgMember } from "@/lib/authz";
import { assertWithinLimit, getOrgPlan, LimitError } from "@/lib/api/limits";
import { toCsv } from "@/lib/api/misc";
import { daysBetween, HISTORY_MAX_DAYS } from "@/lib/api/params";
import { lagosToday } from "@/lib/time";
import { areaCells, forecastForCells, getArea, observedForCells } from "@/server/queries/org";

/**
 * GET /org/[orgId]/downloads/file?area=&dataset=observed|forecast&format=csv|xlsx[&from=&to=]
 * Members only; gated by plans.limits.downloads. Observed span ≤ 1 year.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z
  .object({
    area: z.string().uuid(),
    dataset: z.enum(["observed", "forecast"]),
    format: z.enum(["csv", "xlsx"]),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dataset !== "observed") return;
    if (!v.from || !v.to) return ctx.addIssue({ code: "custom", message: "from and to are required" });
    const span = daysBetween(v.from, v.to);
    if (span < 0 || span + 1 > HISTORY_MAX_DAYS) ctx.addIssue({ code: "custom", message: "range must be 1–366 days" });
  });

/** Grid centres are x.x5 — round away float noise for exports. */
const r2 = (v: number | undefined) => (v == null ? null : Math.round(v * 100) / 100);

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    await requireOrgMember(orgId);
    const plan = await getOrgPlan(orgId);
    assertWithinLimit("downloads", plan.limits);
  } catch (e) {
    if (e instanceof AuthzError) return new NextResponse("Not found", { status: 404 });
    if (e instanceof LimitError) return new NextResponse(e.message, { status: 403 });
    throw e;
  }
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return new NextResponse("Invalid download request", { status: 400 });
  const q = parsed.data;
  const area = await getArea(orgId, q.area);
  if (!area) return new NextResponse("Not found", { status: 404 });

  const cells = await areaCells(orgId, q.area);
  const label = new Map(cells.map((c) => [c.gridCellId, c]));
  const ids = cells.map((c) => c.gridCellId);

  let header: string[];
  let rows: (string | number | boolean | null)[][];
  if (q.dataset === "observed") {
    const data = await observedForCells(ids, q.from!, q.to!);
    header = ["date", "place", "cell_lat", "cell_lon", "rain_mm", "tmax_c", "tmin_c", "humidity_pct", "wind_kmh", "source", "preliminary"];
    rows = data.map((r) => {
      const c = label.get(r.gridCellId);
      return [r.date, c?.label ?? "", r2(c?.lat), r2(c?.lon), r.rainMm, r.tmaxC, r.tminC, r.humidityPct, r.windKmh, r.source, r.preliminary];
    });
  } else {
    const data = await forecastForCells(ids, lagosToday());
    header = ["date", "place", "cell_lat", "cell_lon", "rain_mm", "rain_prob_pct", "tmax_c", "tmin_c", "wind_max_kmh", "source", "fetched_at"];
    rows = data.map((r) => {
      const c = label.get(r.gridCellId);
      return [r.date, c?.label ?? "", r2(c?.lat), r2(c?.lon), r.rainMm, r.rainProbPct, r.tmaxC, r.tminC, r.windMaxKmh, r.source, r.fetchedAt.toISOString()];
    });
  }

  const safeName = area.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "area";
  const base = `weatherdesk-${safeName}-${q.dataset}${q.dataset === "observed" ? `-${q.from}_${q.to}` : ""}`;
  const attribution = "Data: NASA POWER, Open-Meteo (CC BY 4.0). Independent service — not affiliated with NiMet.";

  if (q.format === "csv") {
    return new NextResponse(`# ${attribution}\r\n${toCsv(header, rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "WeatherDesk";
  const ws = wb.addWorksheet(q.dataset === "observed" ? "Observed daily" : "Forecast daily");
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c) => (c.width = 14));
  const about = wb.addWorksheet("About");
  about.addRow(["Area", area.name]);
  about.addRow(["Dataset", q.dataset]);
  about.addRow(["Attribution", attribution]);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
