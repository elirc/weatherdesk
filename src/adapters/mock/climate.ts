/**
 * Deterministic synthetic Nigerian climate, shared by the mock forecast and
 * mock history drivers so that observations, forecasts, normals and accuracy
 * stats are mutually consistent in mock mode.
 *
 * The model: smooth seasonal curves parameterised by latitude (Nigeria spans
 * ~4°N coastal rainforest to ~14°N Sahel), plus seeded day-to-day noise.
 * - South (<7°N): bimodal rains (peaks ~June and ~September), annual ~1800mm,
 *   tmax 28–33°C.
 * - North (>10°N): single peak (~August), annual ~700mm, tmax 31–40°C with a
 *   Feb–May hot season.
 * - Forecast values = "truth" + noise that grows with lead day, so the
 *   accuracy page shows a realistic degradation curve.
 */

/** Deterministic 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — returns a function yielding floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Day of year 1..366 for a YYYY-MM-DD string (UTC). */
export function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

function gaussianBump(doy: number, centre: number, width: number): number {
  const d = Math.min(Math.abs(doy - centre), 366 - Math.abs(doy - centre));
  return Math.exp(-(d * d) / (2 * width * width));
}

export type ClimateDay = {
  /** expected (climatological) values for this lat/doy */
  rainMeanMm: number;
  rainProbability: number; // 0..1 chance of a rainy day
  tmaxC: number;
  tminC: number;
  humidityPct: number;
  windKmh: number;
  solarMjM2: number;
};

/** Smooth climatology for a latitude and day-of-year. Pure, no randomness. */
export function climatology(lat: number, doy: number): ClimateDay {
  // 0 at 4°N (deep south) → 1 at 14°N (far north)
  const n = Math.min(1, Math.max(0, (lat - 4) / 10));

  // Rain seasonality: south bimodal (peaks doy 160 & 255), north single (doy 220)
  const southSeason = 0.8 * gaussianBump(doy, 160, 38) + 0.7 * gaussianBump(doy, 255, 30);
  const northSeason = 1.15 * gaussianBump(doy, 220, 42);
  const season = (1 - n) * southSeason + n * northSeason;

  const annualMm = 1900 - 1250 * n; // ~1900 south → ~650 far north
  // scale: integral of the season curve over the year ≈ width*sqrt(2π)*amps
  const seasonIntegral = (1 - n) * (0.8 * 38 + 0.7 * 30) * 2.507 + n * 1.15 * 42 * 2.507;
  const rainMeanMm = (annualMm * season) / seasonIntegral;

  const rainProbability = Math.min(0.9, season * (0.75 - 0.15 * n) + 0.04);

  // Temperature: north has a pronounced hot season (Mar–May) and cool harmattan
  const hotSeason = gaussianBump(doy, 105, 55); // peaks mid-April
  const coolWet = season; // rains cool things down
  const tmaxC = 30 + 6 * n * hotSeason + 2.5 * (1 - n) * hotSeason - 3.5 * coolWet + 1.5 * n;
  const tminC = tmaxC - (7 + 5 * n * (1 - coolWet)); // bigger diurnal range in dry north

  const humidityPct = Math.min(95, 55 + 30 * coolWet + 12 * (1 - n) - 18 * n * (1 - coolWet));
  const windKmh = 9 + 5 * n + 4 * gaussianBump(doy, 15, 40) * n; // harmattan breeze
  const solarMjM2 = 16 + 6 * n * (1 - coolWet) + 3 * (1 - coolWet);

  return { rainMeanMm, rainProbability, tmaxC, tminC, humidityPct, windKmh, solarMjM2 };
}

export type SyntheticDay = {
  date: string;
  rainMm: number;
  tmaxC: number;
  tminC: number;
  humidityPct: number;
  windKmh: number;
  gustsKmh: number;
  solarMjM2: number;
  rainy: boolean;
};

/** The deterministic "truth" for a point and date (what mock history returns). */
export function syntheticObserved(lat: number, lon: number, date: string): SyntheticDay {
  const doy = dayOfYear(date);
  const c = climatology(lat, doy);
  const rng = mulberry32(hash32(`${lat.toFixed(1)}|${lon.toFixed(1)}|${date}`));

  const rainy = rng() < c.rainProbability;
  // skewed daily totals: most rainy days light, occasional heavy
  const r = rng();
  const rainMm = rainy ? Math.round((c.rainMeanMm / Math.max(0.05, c.rainProbability)) * (0.3 + 1.7 * r * r) * 10) / 10 : 0;
  const tmaxC = Math.round((c.tmaxC + (rng() - 0.5) * 4 - (rainy ? 1.5 : 0)) * 10) / 10;
  const tminC = Math.round((c.tminC + (rng() - 0.5) * 3) * 10) / 10;
  const windKmh = Math.round((c.windKmh * (0.6 + rng() * 0.9)) * 10) / 10;
  const gustsKmh = Math.round(windKmh * (1.7 + rng() * (rainy ? 1.6 : 0.6)) * 10) / 10;
  const humidityPct = Math.round(Math.min(98, c.humidityPct + (rng() - 0.5) * 14));
  const solarMjM2 = Math.round((c.solarMjM2 * (rainy ? 0.6 : 1) * (0.85 + rng() * 0.3)) * 10) / 10;

  return { date, rainMm, tmaxC, tminC, humidityPct, windKmh, gustsKmh, solarMjM2, rainy };
}

/**
 * The deterministic forecast for a target date as issued `leadDays` ahead:
 * truth blended toward climatology plus lead-dependent noise.
 */
export function syntheticForecastDay(
  lat: number,
  lon: number,
  targetDate: string,
  leadDays: number,
): SyntheticDay & { rainProbPct: number } {
  const truth = syntheticObserved(lat, lon, targetDate);
  const c = climatology(lat, dayOfYear(targetDate));
  const rng = mulberry32(hash32(`fc|${lat.toFixed(1)}|${lon.toFixed(1)}|${targetDate}|${leadDays}`));

  const skill = Math.max(0.15, 1 - leadDays * 0.055); // 1 → ~0.15 at day 15
  const blend = (truthV: number, climV: number, noiseAmp: number) =>
    Math.round((truthV * skill + climV * (1 - skill) + (rng() - 0.5) * noiseAmp * (1 - skill) * 2) * 10) / 10;

  const rainMm = Math.max(0, blend(truth.rainMm, c.rainMeanMm, 8));
  const tmaxC = blend(truth.tmaxC, c.tmaxC, 3.5);
  const tminC = blend(truth.tminC, c.tminC, 2.5);

  // probability: sharp near-term, regresses to climatology far out
  const pTruth = truth.rainy ? 0.92 : 0.06;
  const rainProbPct = Math.round((pTruth * skill + c.rainProbability * (1 - skill)) * 100);

  return {
    ...truth,
    rainMm,
    tmaxC,
    tminC,
    rainProbPct,
    windKmh: blend(truth.windKmh, c.windKmh, 4),
    gustsKmh: blend(truth.gustsKmh, c.windKmh * 2, 8),
  };
}
