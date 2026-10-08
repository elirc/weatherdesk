/**
 * Provenance-carrying value shapes. Every number shown to a user travels as a
 * SourcedValue so the UI can always render its source, age and preliminary flag
 * (CONVENTIONS rule 3).
 */

export type SourcedValue<T = number> = {
  value: T;
  /** e.g. 'open-meteo', 'nasa-power', 'mock', 'computed' */
  source: string;
  fetchedAt: Date;
  preliminary?: boolean;
};

export function sourced<T>(
  value: T,
  source: string,
  fetchedAt: Date,
  preliminary = false,
): SourcedValue<T> {
  return { value, source, fetchedAt, preliminary };
}

export type PlaceRef =
  | { kind: "state"; id: number; slug: string; name: string }
  | { kind: "lga"; id: number; slug: string; name: string }
  | { kind: "settlement"; id: number; name: string }
  | { kind: "point"; lat: number; lon: number };
