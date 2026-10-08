/**
 * NASA POWER daily point driver (real) — final observations / history.
 *
 * Docs (verified 2026-10-08): https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 * No API key. Community AG; parameters PRECTOTCORR, T2M_MAX, T2M_MIN, RH2M,
 * WS2M, ALLSKY_SFC_SW_DWN; -999 fills → null; WS2M m/s → km/h.
 * The docs give no numeric rate limit but warn that rapid repeated requests
 * may be blocked — callers (worker jobs) throttle between calls and fetch at
 * most one calendar year per request.
 */

import type { HistoryAdapter, LatLon, ObservedDay } from "../types";
import { fetchJson, tracked } from "./http";
import { buildNasaUrl, mapNasaPower, type NasaPowerBody } from "./mappers/nasa-power";

const SOURCE = "nasa-power";

export const nasaPowerAdapter: HistoryAdapter = {
  name: SOURCE,
  async fetchDaily(point: LatLon, startDate: string, endDate: string): Promise<ObservedDay[]> {
    if (startDate > endDate) return [];
    const url = buildNasaUrl(point, startDate, endDate);
    const body = await tracked(SOURCE, () =>
      fetchJson<NasaPowerBody>(SOURCE, url, { timeoutMs: 60_000, label: `${startDate}..${endDate}` }),
    );
    return mapNasaPower(body).filter((d) => d.date >= startDate && d.date <= endDate);
  },
};
