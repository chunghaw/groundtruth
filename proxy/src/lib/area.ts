import { canonSuburb } from "./normalise";

/**
 * The 29 suburbs the hackathon key covers, exactly as GET /v1/me names them (2026-11-07).
 * Compared on the base name (suffix "(…)" stripped by canonSuburb); suburb-level API calls must
 * use the suffixed name, via apiSuburbName(). Paddington, Newtown, Annandale and St Peters are
 * NOT covered and resolve to OUT_OF_AREA.
 */
export const AREA_SUBURBS: readonly string[] = [
  "Alexandria", "Barangaroo", "Beaconsfield (NSW)", "Camperdown (NSW)", "Centennial Park (NSW)",
  "Chippendale", "Darlinghurst", "Darlington (Sydney - NSW)", "Dawes Point", "Elizabeth Bay",
  "Erskineville", "Eveleigh", "Forest Lodge", "Glebe (NSW)", "Haymarket", "Millers Point",
  "Moore Park", "Potts Point", "Pyrmont", "Redfern", "Rosebery (NSW)", "Rushcutters Bay",
  "Surry Hills", "Sydney", "The Rocks (Sydney - NSW)", "Ultimo", "Waterloo (NSW)", "Woolloomooloo",
  "Zetland",
];

/** @deprecated kept for older imports; identical to AREA_SUBURBS. */
export const FALLBACK_AREA_SUBURBS = AREA_SUBURBS;

const API_NAME_BY_BASE: ReadonlyMap<string, string> = new Map(AREA_SUBURBS.map((s) => [canonSuburb(s)!, s]));

const state = ((globalThis as { __gtArea?: { set: Set<string>; source: "fallback" | "api" } }).__gtArea ??= {
  set: new Set(API_NAME_BY_BASE.keys()),
  source: "fallback",
});

export function areaSource(): "fallback" | "api" {
  return state.source;
}

/** Suffixed API suburb name for a base name ("Camperdown" -> "Camperdown (NSW)"); null if not covered. */
export function apiSuburbName(base: string | null | undefined): string | null {
  const c = canonSuburb(base);
  return c ? (API_NAME_BY_BASE.get(c) ?? null) : null;
}

/**
 * Records that the API list was loaded. The area is the key's 29 suburbs and is never widened:
 * an API list can only confirm (intersect), and an empty intersection is ignored.
 */
export function setAreaSuburbs(names: readonly string[]): void {
  const canon = names.map((n) => canonSuburb(n)).filter((n): n is string => !!n && API_NAME_BY_BASE.has(n));
  if (canon.length === 0) return;
  state.set = new Set(API_NAME_BY_BASE.keys());
  state.source = "api";
}

/** Canonical suburb in area? Unknown suburb (null) is allowed through; the geocoder decides. */
export function isInArea(suburbCanon: string | null): boolean {
  if (!suburbCanon) return true;
  return state.set.has(suburbCanon);
}
