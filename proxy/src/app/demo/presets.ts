/** Fictional sample listings for the public demo. Addresses are chosen to hit each resolver state in MOCK mode. */
export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly expect: "EXACT" | "BUILDING" | "CHOOSE" | "NO_MATCH" | "OUT_OF_AREA";
  readonly kind: string;
  readonly beds: number;
  readonly baths: number;
  readonly cars: number;
  readonly blurb: string;
}

export const PRESETS: readonly Preset[] = [
  { id: "exact-unit", label: "Exact: unit named in heading", address: "12/45 Crown Street, Surry Hills NSW 2010", expect: "EXACT", kind: "Apartment", beds: 2, baths: 1, cars: 1, blurb: "A placeholder two-bedroom apartment. The heading names the unit, so Groundtruth can pin one home." },
  { id: "exact-house", label: "Exact: freestanding house", address: "24 Glebe Point Road, Glebe NSW 2037", expect: "EXACT", kind: "House", beds: 3, baths: 2, cars: 0, blurb: "A placeholder terrace. One dwelling at this street number, so the match is exact." },
  { id: "building", label: "Building: unit missing (narrow by bedrooms)", address: "17 Bourke Street, Surry Hills NSW 2010", expect: "BUILDING", kind: "Apartment", beds: 2, baths: 1, cars: 0, blurb: "The listing gives only the building's street address. Groundtruth refuses to guess and asks which unit; tap a bedroom count to narrow the list." },
  { id: "choose", label: "Choose: several records match", address: "7 Twin Lane, Ultimo NSW 2007", expect: "CHOOSE", kind: "Townhouse", beds: 2, baths: 2, cars: 1, blurb: "Two address records share this exact address. Groundtruth shows both and lets the buyer pick." },
  { id: "no-match", label: "No match: address not found", address: "8 Nomatch Street, Pyrmont NSW 2009", expect: "NO_MATCH", kind: "Apartment", beds: 1, baths: 1, cars: 0, blurb: "No address record matches. A wrong home is worse than no answer, so the panel says so plainly." },
  { id: "out-of-area", label: "Out of area: outside City of Sydney", address: "5 Church Street, Parramatta NSW 2150", expect: "OUT_OF_AREA", kind: "House", beds: 4, baths: 2, cars: 2, blurb: "Outside the 29-suburb pilot area, so no data call is made at all." },
];
