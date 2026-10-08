/** Nigeria's six geopolitical zones and the state → zone assignment. */

export const ZONES = [
  "north-west",
  "north-east",
  "north-central",
  "south-west",
  "south-east",
  "south-south",
] as const;

export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  "north-west": "North West",
  "north-east": "North East",
  "north-central": "North Central",
  "south-west": "South West",
  "south-east": "South East",
  "south-south": "South South",
};

/** Keyed by state name as it appears in the boundary data. */
export const STATE_ZONES: Record<string, Zone> = {
  Jigawa: "north-west",
  Kaduna: "north-west",
  Kano: "north-west",
  Katsina: "north-west",
  Kebbi: "north-west",
  Sokoto: "north-west",
  Zamfara: "north-west",
  Adamawa: "north-east",
  Bauchi: "north-east",
  Borno: "north-east",
  Gombe: "north-east",
  Taraba: "north-east",
  Yobe: "north-east",
  Benue: "north-central",
  Kogi: "north-central",
  Kwara: "north-central",
  Nasarawa: "north-central",
  Niger: "north-central",
  Plateau: "north-central",
  "Federal Capital Territory": "north-central",
  Ekiti: "south-west",
  Lagos: "south-west",
  Ogun: "south-west",
  Ondo: "south-west",
  Osun: "south-west",
  Oyo: "south-west",
  Abia: "south-east",
  Anambra: "south-east",
  Ebonyi: "south-east",
  Enugu: "south-east",
  Imo: "south-east",
  "Akwa Ibom": "south-south",
  Bayelsa: "south-south",
  "Cross River": "south-south",
  Delta: "south-south",
  Edo: "south-south",
  Rivers: "south-south",
};

/** ISO 3166-2 codes keyed by state name (used for states.code). */
export const STATE_CODES: Record<string, string> = {
  Abia: "NG-AB",
  Adamawa: "NG-AD",
  "Akwa Ibom": "NG-AK",
  Anambra: "NG-AN",
  Bauchi: "NG-BA",
  Bayelsa: "NG-BY",
  Benue: "NG-BE",
  Borno: "NG-BO",
  "Cross River": "NG-CR",
  Delta: "NG-DE",
  Ebonyi: "NG-EB",
  Edo: "NG-ED",
  Ekiti: "NG-EK",
  Enugu: "NG-EN",
  "Federal Capital Territory": "NG-FC",
  Gombe: "NG-GO",
  Imo: "NG-IM",
  Jigawa: "NG-JI",
  Kaduna: "NG-KD",
  Kano: "NG-KN",
  Katsina: "NG-KT",
  Kebbi: "NG-KE",
  Kogi: "NG-KO",
  Kwara: "NG-KW",
  Lagos: "NG-LA",
  Nasarawa: "NG-NA",
  Niger: "NG-NI",
  Ogun: "NG-OG",
  Ondo: "NG-ON",
  Osun: "NG-OS",
  Oyo: "NG-OY",
  Plateau: "NG-PL",
  Rivers: "NG-RI",
  Sokoto: "NG-SO",
  Taraba: "NG-TA",
  Yobe: "NG-YO",
  Zamfara: "NG-ZA",
};

/** 0.1° grid helpers (~11 km). */
export function gridIdx(v: number): number {
  return Math.floor(v * 10);
}

export function gridCentre(idx: number): number {
  return idx / 10 + 0.05;
}

/** Nigeria bounding box (with margin) for validating points. */
export const NIGERIA_BBOX = { minLat: 4.0, maxLat: 14.1, minLon: 2.5, maxLon: 15.0 } as const;

export function inNigeriaBbox(lat: number, lon: number): boolean {
  return (
    lat >= NIGERIA_BBOX.minLat &&
    lat <= NIGERIA_BBOX.maxLat &&
    lon >= NIGERIA_BBOX.minLon &&
    lon <= NIGERIA_BBOX.maxLon
  );
}
