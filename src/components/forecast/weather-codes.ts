import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  type LucideIcon,
  Snowflake,
  Sun,
} from "lucide-react";

/**
 * WMO weather interpretation codes (as used by Open-Meteo, field
 * `weather_code`) → label + lucide icon. THE single mapping for the app —
 * import from here, never re-map elsewhere.
 * Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export type WeatherCodeInfo = {
  code: number;
  label: string;
  icon: LucideIcon;
  /** coarse group, handy for colouring / grouping */
  group: "clear" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";
};

const entries: [number, string, LucideIcon, WeatherCodeInfo["group"]][] = [
  [0, "Clear sky", Sun, "clear"],
  [1, "Mainly clear", Sun, "clear"],
  [2, "Partly cloudy", CloudSun, "cloud"],
  [3, "Overcast", Cloud, "cloud"],
  [45, "Fog", CloudFog, "fog"],
  [48, "Depositing rime fog", CloudFog, "fog"],
  [51, "Light drizzle", CloudDrizzle, "drizzle"],
  [53, "Drizzle", CloudDrizzle, "drizzle"],
  [55, "Dense drizzle", CloudDrizzle, "drizzle"],
  [56, "Light freezing drizzle", CloudDrizzle, "drizzle"],
  [57, "Freezing drizzle", CloudDrizzle, "drizzle"],
  [61, "Light rain", CloudRain, "rain"],
  [63, "Rain", CloudRain, "rain"],
  [65, "Heavy rain", CloudRainWind, "rain"],
  [66, "Light freezing rain", CloudRain, "rain"],
  [67, "Freezing rain", CloudRain, "rain"],
  [71, "Light snow", CloudSnow, "snow"],
  [73, "Snow", CloudSnow, "snow"],
  [75, "Heavy snow", Snowflake, "snow"],
  [77, "Snow grains", Snowflake, "snow"],
  [80, "Light showers", CloudRain, "rain"],
  [81, "Showers", CloudRain, "rain"],
  [82, "Violent showers", CloudRainWind, "rain"],
  [85, "Light snow showers", CloudSnow, "snow"],
  [86, "Snow showers", CloudSnow, "snow"],
  [95, "Thunderstorm", CloudLightning, "storm"],
  [96, "Thunderstorm with hail", CloudHail, "storm"],
  [99, "Thunderstorm with heavy hail", CloudHail, "storm"],
];

/** Every WMO code the providers can emit. */
export const WMO_CODES: readonly number[] = entries.map((e) => e[0]);

export const WEATHER_CODES: ReadonlyMap<number, WeatherCodeInfo> = new Map(
  entries.map(([code, label, icon, group]) => [code, { code, label, icon, group }]),
);

export const UNKNOWN_WEATHER: Omit<WeatherCodeInfo, "code"> = {
  label: "Weather unavailable",
  icon: Cloud,
  group: "cloud",
};

export function weatherCodeInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code !== null && code !== undefined) {
    const hit = WEATHER_CODES.get(code);
    if (hit) return hit;
  }
  return { code: code ?? -1, ...UNKNOWN_WEATHER };
}
