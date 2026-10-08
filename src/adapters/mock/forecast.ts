import type {
  DailyPoint,
  ForecastAdapter,
  ForecastResult,
  HourlyPoint,
  LatLon,
  ObservedDay,
} from "../types";
import { syntheticForecastDay, syntheticObserved } from "./climate";

const FIXED_FETCHED_AT = () => new Date();

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateUTC(d);
}

/** WMO-ish weather code from the synthetic day. */
function weatherCode(rainMm: number, rainProbPct: number): number {
  if (rainMm >= 20) return 95; // thunderstorm
  if (rainMm >= 5) return 63; // rain
  if (rainMm >= 0.5) return 61; // light rain
  if (rainProbPct >= 50) return 3; // overcast
  if (rainProbPct >= 25) return 2; // partly cloudy
  return 1; // mainly clear
}

/** Sunrise ~06:30, sunset ~18:45 Lagos (±1h over the year — fixed for mock). */
function sunTimes(date: string): { sunrise: Date; sunset: Date } {
  return {
    sunrise: new Date(`${date}T05:30:00Z`), // 06:30 WAT
    sunset: new Date(`${date}T17:45:00Z`), // 18:45 WAT
  };
}

function hourlyFromDaily(lat: number, lon: number, date: string, lead: number): HourlyPoint[] {
  const day = syntheticForecastDay(lat, lon, date, lead);
  const hours: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    // diurnal temperature: min at 06 local (05 UTC), max at 14 local (13 UTC)
    const phase = Math.cos(((h - 13 + 24) % 24) * (Math.PI / 12));
    const t = (day.tmaxC + day.tminC) / 2 + ((day.tmaxC - day.tminC) / 2) * phase;
    // rain concentrated 14:00–20:00 local
    const inRainWindow = h >= 13 && h <= 19;
    const rainShare = inRainWindow ? day.rainMm / 7 : 0;
    hours.push({
      validTime: new Date(`${date}T${String(h).padStart(2, "0")}:00:00Z`),
      temperatureC: Math.round(t * 10) / 10,
      feelsLikeC: Math.round((t + (day.humidityPct > 75 ? 2.5 : 0.5)) * 10) / 10,
      humidityPct: day.humidityPct,
      rainMm: Math.round(rainShare * 10) / 10,
      rainProbPct: inRainWindow ? day.rainProbPct : Math.max(0, day.rainProbPct - 30),
      windSpeedKmh: day.windKmh,
      windGustsKmh: day.gustsKmh,
      windDirectionDeg: 225,
      cloudCoverPct: Math.min(100, day.rainProbPct + 20),
      weatherCode: weatherCode(rainShare, day.rainProbPct),
      uvIndex: h >= 9 && h <= 16 ? Math.max(0, 11 - Math.abs(h - 12.5) * 2 - (day.rainy ? 3 : 0)) : 0,
    });
  }
  return hours;
}

/** Deterministic fixtures; zero network. */
export const mockForecastAdapter: ForecastAdapter = {
  name: "mock",
  maxPointsPerCall: 50,

  async fetchForecast(points: LatLon[]): Promise<ForecastResult[]> {
    const fetchedAt = FIXED_FETCHED_AT();
    const today = isoDateUTC(new Date());
    return points.map((point) => {
      const daily: DailyPoint[] = [];
      const hourly: HourlyPoint[] = [];
      for (let lead = 0; lead < 16; lead++) {
        const date = addDays(today, lead);
        const day = syntheticForecastDay(point.lat, point.lon, date, lead);
        const sun = sunTimes(date);
        daily.push({
          date,
          tmaxC: day.tmaxC,
          tminC: day.tminC,
          rainMm: day.rainMm,
          rainProbPct: day.rainProbPct,
          windMaxKmh: day.windKmh,
          gustsMaxKmh: day.gustsKmh,
          uvIndexMax: day.rainy ? 7 : 10,
          weatherCode: weatherCode(day.rainMm, day.rainProbPct),
          sunrise: sun.sunrise,
          sunset: sun.sunset,
        });
        if (lead < 3) hourly.push(...hourlyFromDaily(point.lat, point.lon, date, lead));
      }
      return { point, hourly, daily, source: "mock", fetchedAt };
    });
  },

  async fetchRecentDaily(points: LatLon[], days: number) {
    const fetchedAt = FIXED_FETCHED_AT();
    const today = isoDateUTC(new Date());
    return points.map((point) => {
      const out: ObservedDay[] = [];
      for (let back = days; back >= 1; back--) {
        const date = addDays(today, -back);
        const d = syntheticObserved(point.lat, point.lon, date);
        out.push({
          date,
          rainMm: d.rainMm,
          tmaxC: d.tmaxC,
          tminC: d.tminC,
          humidityPct: d.humidityPct,
          windKmh: d.windKmh,
          solarMjM2: d.solarMjM2,
        });
      }
      return { point, days: out, source: "mock", fetchedAt };
    });
  },
};
