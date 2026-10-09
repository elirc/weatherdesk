import { findLga } from "@/lib/api/data";
import { apiOptions, withApi } from "@/lib/api/guard";
import { forecastParams, searchParamsObject } from "@/lib/api/params";
import { ApiHttpError, envelope, zodMessage } from "@/lib/api/respond";
import { JOBS, sendJob } from "@/lib/queue";
import { cellAtPoint, daily16, latestHourly, nearestActiveCell, newestDailyFetch } from "@/server/queries/weather";

/**
 * GET /api/v1/forecast?lga=<code|slug>  or  ?lat=&lon=   [&hourly=true]
 * 16-day daily forecast (+ 48 h hourly) for the grid cell covering the
 * place, with source + fetchedAt on every row.
 */
export async function GET(request: Request) {
  return withApi(request, "forecast", async () => {
    const parsed = forecastParams.safeParse(searchParamsObject(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiHttpError("bad_request", zodMessage(parsed.error.issues));
    const q = parsed.data;

    let cellId: number | null = null;
    let place: Record<string, unknown>;
    if (q.lga) {
      const lga = await findLga(q.lga);
      if (!lga) throw new ApiHttpError("not_found", `No LGA with code or slug "${q.lga}"`);
      cellId = lga.gridCellId;
      place = {
        kind: "lga",
        code: lga.code,
        slug: lga.slug,
        name: lga.name,
        state: { code: lga.stateCode, name: lga.stateName },
        lat: lga.centreLat,
        lon: lga.centreLon,
      };
    } else {
      const lat = q.lat!;
      const lon = q.lon!;
      const exact = await cellAtPoint(lat, lon);
      const cell = exact?.active ? exact : ((await nearestActiveCell(lat, lon)) ?? exact);
      if (!exact) {
        // first request for this point: ask the worker to activate the cell (never a provider call here)
        sendJob(JOBS.cellActivate, { lat, lon }, { singletonKey: `cell:${lat.toFixed(1)}:${lon.toFixed(1)}` }).catch(() => {});
      }
      cellId = cell?.id ?? null;
      place = { kind: "point", lat, lon, cellCentre: cell ? { lat: cell.centreLat, lon: cell.centreLon } : null };
    }

    if (cellId == null) {
      throw new ApiHttpError("not_found", "No forecast coverage for this place yet — it has been queued; retry in a few minutes.");
    }
    const [daily, hourly, newest] = await Promise.all([
      daily16(cellId),
      q.hourly ? latestHourly(cellId) : Promise.resolve(null),
      newestDailyFetch(cellId),
    ]);
    if (!daily.length) {
      throw new ApiHttpError("not_found", "No forecast rows for this place yet — retry in a few minutes.");
    }
    const body = envelope(
      {
        place,
        daily: daily.map((d) => ({
          date: d.date,
          tmaxC: d.tmaxC,
          tminC: d.tminC,
          rainMm: d.rainMm,
          rainProbPct: d.rainProbPct,
          windMaxKmh: d.windMaxKmh,
          gustsMaxKmh: d.gustsMaxKmh,
          uvIndexMax: d.uvIndexMax,
          weatherCode: d.weatherCode,
          sunrise: d.sunrise?.toISOString() ?? null,
          sunset: d.sunset?.toISOString() ?? null,
          source: d.source,
          fetchedAt: d.fetchedAt.toISOString(),
        })),
        ...(hourly
          ? {
              hourly: hourly.map((h) => ({
                time: h.validTime.toISOString(),
                temperatureC: h.temperatureC,
                feelsLikeC: h.feelsLikeC,
                humidityPct: h.humidityPct,
                rainMm: h.rainMm,
                rainProbPct: h.rainProbPct,
                windSpeedKmh: h.windSpeedKmh,
                windGustsKmh: h.windGustsKmh,
                windDirectionDeg: h.windDirectionDeg,
                cloudCoverPct: h.cloudCoverPct,
                weatherCode: h.weatherCode,
                uvIndex: h.uvIndex,
                source: h.source,
                fetchedAt: h.fetchedAt.toISOString(),
              })),
            }
          : {}),
      },
      { source: newest?.source ?? daily[0]!.source, fetchedAt: newest?.fetchedAt ?? daily[0]!.fetchedAt, timezone: "Africa/Lagos" },
    );
    return { body };
  });
}

export const OPTIONS = apiOptions;
