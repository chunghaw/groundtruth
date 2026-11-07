/** Fictional sample listings for the public demo. Addresses are chosen to hit each resolver state in MOCK mode. */
export type ExpectedState = "EXACT" | "BUILDING" | "CHOOSE" | "NO_MATCH" | "OUT_OF_AREA";
export type PropertyKind = "Apartment" | "House" | "Townhouse";

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly expect: ExpectedState;
  readonly kind: PropertyKind;
  readonly beds: number;
  readonly baths: number;
  readonly cars: number;
  readonly blurb: string;
  /** Approximate map centre for the hero map (street-level precision is enough for a backdrop). */
  readonly lat: number;
  readonly lon: number;
  /** Placeholder headline written for the demo (not copied from any listing). */
  readonly headline: string;
}

export const PRESETS: readonly Preset[] = [
  { id: "exact-unit", label: "Exact: unit named in heading", address: "12/45 Crown Street, Surry Hills NSW 2010", expect: "EXACT", kind: "Apartment", beds: 2, baths: 1, cars: 1, lat: -33.8813, lon: 151.2142,
    headline: "Placeholder: light-filled two-bedder near Crown Street",
    blurb: "A placeholder two-bedroom apartment. The heading names the unit, so Groundtruth can pin one home." },
  { id: "exact-house", label: "Exact: freestanding house", address: "24 Glebe Point Road, Glebe NSW 2037", expect: "EXACT", kind: "House", beds: 3, baths: 2, cars: 0, lat: -33.8786, lon: 151.1912,
    headline: "Placeholder: Victorian terrace on Glebe Point Road",
    blurb: "A placeholder terrace. One dwelling at this street number, so the match is exact." },
  { id: "building", label: "Building: unit missing (narrow by bedrooms)", address: "17 Bourke Street, Surry Hills NSW 2010", expect: "BUILDING", kind: "Apartment", beds: 2, baths: 1, cars: 0, lat: -33.8862, lon: 151.2128,
    headline: "Placeholder: apartment in a Bourke Street block",
    blurb: "The listing gives only the building's street address. Groundtruth refuses to guess and asks which unit; tap a bedroom count to narrow the list." },
  { id: "choose", label: "Choose: several records match", address: "7 Twin Lane, Ultimo NSW 2007", expect: "CHOOSE", kind: "Townhouse", beds: 2, baths: 2, cars: 1, lat: -33.8797, lon: 151.1978,
    headline: "Placeholder: townhouse off Harris Street",
    blurb: "Two address records share this exact address. Groundtruth shows both and lets the buyer pick." },
  { id: "no-match", label: "No match: address not found", address: "8 Nomatch Street, Pyrmont NSW 2009", expect: "NO_MATCH", kind: "Apartment", beds: 1, baths: 1, cars: 0, lat: -33.8698, lon: 151.1937,
    headline: "Placeholder: one-bedder on the Pyrmont peninsula",
    blurb: "No address record matches. A wrong home is worse than no answer, so the panel says so plainly." },
  { id: "out-of-area", label: "Out of area: outside City of Sydney", address: "5 Church Street, Parramatta NSW 2150", expect: "OUT_OF_AREA", kind: "House", beds: 4, baths: 2, cars: 2, lat: -33.8149, lon: 151.0035,
    headline: "Placeholder: family home near the river",
    blurb: "Outside the 29-suburb pilot area, so no data call is made at all." },
];

/** "12/45 Crown Street, Surry Hills NSW 2010" -> ["12/45 Crown Street", "Surry Hills NSW 2010"] */
export function splitAddress(address: string): readonly [string, string] {
  const i = address.indexOf(",");
  return i === -1 ? [address, ""] : [address.slice(0, i).trim(), address.slice(i + 1).trim()];
}
