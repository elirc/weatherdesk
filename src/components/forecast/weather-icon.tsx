import { weatherCodeInfo } from "./weather-codes";

/** Lucide icon for a WMO code, with the label as accessible name. */
export function WeatherIcon({ code, className }: { code: number | null | undefined; className?: string }) {
  const info = weatherCodeInfo(code);
  const Icon = info.icon;
  return <Icon className={className ?? "size-6"} aria-label={info.label} role="img" />;
}
