import { canonSuburb } from "./normalise";

/**
 * Suburbs the hackathon key covers (City of Sydney LGA). The API says 29; this fallback is
 * deliberately a little permissive (includes suburbs split across LGA borders) because the
 * API's own 403 is the final word and is mapped to OUT_OF_AREA too. Replaced at runtime by
 * GET /v1/suburbs/list?lga=Sydney once a key is present (see loadAreaFromApi).
 */
export const FALLBACK_AREA_SUBURBS: readonly string[] = [
  "Alexandria", "Barangaroo", "Beaconsfield", "Camperdown", "Centennial Park", "Chippendale",
  "Darlinghurst", "Darlington", "Dawes Point", "Elizabeth Bay", "Erskineville", "Eveleigh",
  "Forest Lodge", "Glebe", "Haymarket", "Millers Point", "Moore Park", "Newtown", "Paddington",
  "Potts Point", "Pyrmont", "Redfern", "Rosebery", "Rushcutters Bay", "St Peters", "Surry Hills",
  "Sydney", "The Rocks", "Ultimo", "Waterloo", "Woolloomooloo", "Zetland",
];

const state = ((globalThis as { __gtArea?: { set: Set<string>; source: "fallback" | "api" } }).__gtArea ??= {
  set: new Set(FALLBACK_AREA_SUBURBS.map((s) => canonSuburb(s)!)),
  source: "fallback",
});

export function areaSource(): "fallback" | "api" {
  return state.source;
}

/** Union the API list into the fallback (never shrink below fallback: the API 403 still guards). */
export function setAreaSuburbs(names: readonly string[]): void {
  const canon = names.map((n) => canonSuburb(n)).filter((n): n is string => !!n);
  if (canon.length === 0) return;
  state.set = new Set([...FALLBACK_AREA_SUBURBS.map((s) => canonSuburb(s)!), ...canon]);
  state.source = "api";
}

/** Canonical suburb in area? Unknown suburb (null) is allowed through; the geocoder decides. */
export function isInArea(suburbCanon: string | null): boolean {
  if (!suburbCanon) return true;
  return state.set.has(suburbCanon);
}
