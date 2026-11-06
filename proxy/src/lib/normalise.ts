/**
 * Address normalisation for matching listing addresses to G-NAF candidates.
 *
 * Everything is compared in a canonical, uppercase form:
 *   unit "902", number "417-419" (first "417"), street "BOURKE ST", suburb "SURRY HILLS".
 * The unit-rewrite idea ("Unit 903, 174-182 X" -> "903/174-182 X") is adapted from the
 * Microburbs hackathon demos (fastapi-property-report/main.py), MIT License (c) 2026 Microburbs.
 */

export interface NormalAddress {
  unit: string | null;
  number: string | null;
  numberFirst: string | null;
  street: string | null; // canonical, e.g. "BOURKE ST"
  streetName: string | null; // canonical without type, e.g. "BOURKE"
  streetType: string | null; // canonical type, e.g. "ST"
  suburb: string | null; // canonical, e.g. "SURRY HILLS"
  state: string | null;
  postcode: string | null;
  /** A floor/level prefix was stripped (the listing may name a floor, not a home). */
  hadLevel: boolean;
  /** Human-cased pieces for building geocode queries. */
  streetDisplay: string | null;
  suburbDisplay: string | null;
}

export interface AddressParts {
  unit?: string | null;
  number?: string | null;
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

export interface Checks {
  unit: boolean;
  number: boolean;
  street: boolean;
  suburb: boolean;
}

const STREET_TYPES: Readonly<Record<string, string>> = buildTypeTable({
  ST: ["STREET", "ST", "STR"],
  RD: ["ROAD", "RD"],
  AVE: ["AVENUE", "AVE", "AV"],
  PDE: ["PARADE", "PDE"],
  DR: ["DRIVE", "DR", "DRV"],
  LANE: ["LANE", "LA", "LN"],
  PL: ["PLACE", "PL"],
  CRES: ["CRESCENT", "CRES", "CRS", "CR"],
  TCE: ["TERRACE", "TCE", "TER"],
  HWY: ["HIGHWAY", "HWY"],
  SQ: ["SQUARE", "SQ"],
  WAY: ["WAY", "WY"],
  CL: ["CLOSE", "CL"],
  CT: ["COURT", "CT", "CRT"],
  BVD: ["BOULEVARD", "BOULEVARDE", "BVD", "BLVD", "BVDE"],
  CCT: ["CIRCUIT", "CCT"],
  GR: ["GROVE", "GR", "GRV"],
  ESP: ["ESPLANADE", "ESP"],
  WALK: ["WALK", "WLK"],
  ROW: ["ROW"],
  MEWS: ["MEWS"],
  ALLY: ["ALLEY", "ALLY"],
  ARC: ["ARCADE", "ARC"],
  PROM: ["PROMENADE", "PROM"],
  QY: ["QUAY", "QY"],
  PLZA: ["PLAZA", "PLZA"],
  GDNS: ["GARDENS", "GDNS"],
  RISE: ["RISE"],
  CNR: ["CORNER", "CNR"],
  CIR: ["CIRCLE", "CIR"],
  PWY: ["PATHWAY", "PWAY", "PWY"],
  RDGE: ["RIDGE", "RDGE"],
  CNWY: ["CONCOURSE", "CON", "CNWY"],
});

const DIRECTIONS: Readonly<Record<string, string>> = {
  NORTH: "N", N: "N", SOUTH: "S", S: "S", EAST: "E", E: "E", WEST: "W", W: "W",
};

const STATES = "NSW|VIC|QLD|SA|WA|TAS|ACT|NT";

function buildTypeTable(groups: Record<string, string[]>): Record<string, string> {
  return Object.fromEntries(Object.entries(groups).flatMap(([canon, variants]) => variants.map((v) => [v, canon])));
}

function clean(s: string): string {
  return s.replace(/[–—−]/g, "-").replace(/[.'’`"]/g, "").replace(/\s+/g, " ").trim();
}

export function isStreetType(token: string): boolean {
  return token.toUpperCase() in STREET_TYPES;
}

interface StreetCanon {
  street: string | null;
  name: string | null;
  type: string | null;
}

function splitStreet(input: string | null | undefined): StreetCanon {
  if (!input) return { street: null, name: null, type: null };
  const tokens = clean(input).toUpperCase().replace(/,/g, " ").split(" ").filter(Boolean);
  if (tokens.length === 0) return { street: null, name: null, type: null };
  const t = [...tokens];
  if (t[0] === "SAINT") t[0] = "ST";
  let direction: string | null = null;
  if (t.length >= 3 && t[t.length - 1] in DIRECTIONS && t[t.length - 2] in STREET_TYPES) {
    direction = DIRECTIONS[t[t.length - 1]];
    t.pop();
  }
  let type: string | null = null;
  if (t.length >= 2 && t[t.length - 1] in STREET_TYPES) {
    type = STREET_TYPES[t[t.length - 1]];
    t.pop();
  }
  const name = t.join(" ");
  const street = [name, type, direction].filter(Boolean).join(" ");
  return { street, name: direction ? `${name}|${direction}` : name, type };
}

export function canonStreet(input: string | null | undefined): string | null {
  return splitStreet(input).street;
}

export function canonSuburb(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = clean(input).toUpperCase().replace(/\([^)]*\)/g, " ");
  s = s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/\s+\d{4}$/, "");
  s = s.replace(new RegExp(`\\s+(${STATES})$`), "");
  s = s.replace(/^SAINT\s/, "ST ");
  return s.trim() || null;
}

const SUBURB_GROUPS: readonly (readonly string[])[] = [
  ["SYDNEY", "BARANGAROO", "HAYMARKET", "MILLERS POINT", "DAWES POINT", "THE ROCKS"],
];

/** Canonical alias group for a suburb (the group's first member), or the suburb itself. */
export function suburbGroup(input: string | null | undefined): string | null {
  const s = canonSuburb(input);
  if (!s) return null;
  const g = SUBURB_GROUPS.find((grp) => grp.includes(s));
  return g ? g[0] : s;
}

export function canonUnit(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(Number(s));
  return s.replace(/^([A-Z]+)0+(?=\d)/, "$1");
}

export function canonNumber(input: string | null | undefined): { number: string | null; first: string | null } {
  if (input == null) return { number: null, first: null };
  const s = String(input).toUpperCase().replace(/\s+/g, "");
  if (!s) return { number: null, first: null };
  const first = s.split("-")[0];
  return { number: s, first };
}

export interface StreetLine {
  unit: string | null;
  number: string | null;
  street: string | null;
  streetDisplay: string | null;
  hadLevel: boolean;
}

const LEVEL_RE = /^(?:LEVEL|LVL|FLOOR|FL|L)\b\s*(?:[A-Z]?\d+[A-Z]?|G|GROUND|LG|UG)\b\s*[,/]?\s*/i;
const UNIT_PREFIX_RE =
  /^(?:UNIT|APARTMENT|APT|SUITE|FLAT|SHOP|STUDIO|VILLA|TOWNHOUSE|PENTHOUSE|U)\s*([A-Z]*\d+[A-Z]*)\s*[,/]?\s*(.*)$/i;
const SLASH_UNIT_RE = /^([A-Z0-9&]+)\s*\/\s*(.*)$/i;
const COMMA_UNIT_RE = /^([A-Z]*\d+[A-Z]*)\s*,\s*(\d.*)$/i;
const NUMBER_RE = /^(\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)\s+(.+)$/i;

/** Parses "Level 9, Unit 902, 417-419 Bourke Street" style street lines (no suburb). */
export function parseStreetLine(line: string): StreetLine {
  let s = clean(line);
  let hadLevel = false;
  while (LEVEL_RE.test(s)) {
    hadLevel = true;
    s = s.replace(LEVEL_RE, "");
  }
  let unit: string | null = null;
  const prefixed = s.match(UNIT_PREFIX_RE);
  if (prefixed) {
    unit = prefixed[1];
    s = prefixed[2];
  }
  const slashed = s.match(SLASH_UNIT_RE);
  if (slashed) {
    unit = unit ?? slashed[1];
    s = slashed[2];
  } else if (!unit) {
    const comma = s.match(COMMA_UNIT_RE);
    if (comma) {
      unit = comma[1];
      s = comma[2];
    }
  }
  while (LEVEL_RE.test(s)) {
    hadLevel = true;
    s = s.replace(LEVEL_RE, "");
  }
  const numbered = s.match(NUMBER_RE);
  const number = numbered ? numbered[1] : null;
  const streetDisplay = (numbered ? numbered[2] : s).replace(/^,\s*/, "").trim() || null;
  return {
    unit: canonUnit(unit),
    number: canonNumber(number).number,
    street: canonStreet(streetDisplay),
    streetDisplay,
    hadLevel,
  };
}

function build(line: StreetLine, suburbRaw: string | null, state: string | null, postcode: string | null): NormalAddress {
  const sc = splitStreet(line.streetDisplay);
  const { first } = canonNumber(line.number);
  return {
    unit: line.unit,
    number: line.number,
    numberFirst: first,
    street: sc.street,
    streetName: sc.name,
    streetType: sc.type,
    suburb: canonSuburb(suburbRaw),
    state,
    postcode,
    hadLevel: line.hadLevel,
    streetDisplay: line.streetDisplay,
    suburbDisplay: suburbRaw ? clean(suburbRaw).replace(/\([^)]*\)/g, "").trim() : null,
  };
}

/** Parses a full free-text address: "902/417-419 Bourke Street, Surry Hills, NSW 2010". */
export function parseAddress(raw: string): NormalAddress {
  let s = clean(raw).replace(/,?\s*AUSTRALIA\s*$/i, "");
  let postcode: string | null = null;
  let state: string | null = null;
  const pc = s.match(/[\s,](\d{4})\s*$/);
  if (pc) {
    postcode = pc[1];
    s = s.slice(0, pc.index).trim();
  }
  const st = s.match(new RegExp(`[\\s,](${STATES})\\s*$`, "i"));
  if (st) {
    state = st[1].toUpperCase();
    s = s.slice(0, st.index).trim();
  }
  s = s.replace(/[,\s]+$/, "");
  const segments = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (segments.length >= 2) {
    const suburb = segments[segments.length - 1];
    return build(parseStreetLine(segments.slice(0, -1).join(", ")), suburb, state, postcode);
  }
  return parseCommaless(s, state, postcode);
}

/** "27 ARLINGTON ST BELMONT NORTH": split after the first street-type token that isn't last. */
function parseCommaless(s: string, state: string | null, postcode: string | null): NormalAddress {
  const line = parseStreetLine(s);
  const tokens = (line.streetDisplay ?? "").split(" ");
  for (let i = 1; i < tokens.length - 1; i++) {
    if (isStreetType(tokens[i])) {
      const streetPart = tokens.slice(0, i + 1).join(" ");
      const suburb = tokens.slice(i + 1).join(" ");
      return build({ ...line, streetDisplay: streetPart, street: canonStreet(streetPart) }, suburb, state, postcode);
    }
  }
  return build(line, null, state, postcode);
}

/** Normalises the contract's request: prefer structured parts, fall back to raw text. */
export function normaliseRequest(input: { raw?: string | null; parts?: AddressParts | null }): NormalAddress {
  const p = input.parts;
  if (p && p.street && p.suburb) {
    const prefix = p.unit ? `${p.unit}/` : "";
    const line = parseStreetLine(`${prefix}${p.number ?? ""} ${p.street}`.trim());
    const fromParts = build(line, p.suburb, p.state ? p.state.toUpperCase() : null, p.postcode ?? null);
    if (fromParts.number && fromParts.street) return fromParts;
  }
  return parseAddress(input.raw ?? "");
}

export function formatNormalised(a: NormalAddress): string {
  return [a.unit ? `U${a.unit}` : null, a.number, a.street, a.suburb].filter(Boolean).join(" · ");
}

export function streetKey(a: Pick<NormalAddress, "numberFirst" | "street" | "suburb">): string {
  return `${a.numberFirst ?? ""}|${a.street ?? ""}|${a.suburb ?? ""}`;
}

export function numbersAgree(a: NormalAddress, b: NormalAddress): boolean {
  if (!a.number || !b.number) return false;
  if (a.number === b.number) return true;
  // Ranges must match exactly; a listing range may match a single candidate only at its first number.
  const aRange = a.number.includes("-");
  const bRange = b.number.includes("-");
  return aRange && !bRange && a.numberFirst === b.number;
}

const levelWithoutUnit = (a: NormalAddress): boolean => a.hadLevel && !a.unit;

export function compareAddresses(listing: NormalAddress, cand: NormalAddress): Checks & { streetName: boolean } {
  return {
    unit: !levelWithoutUnit(listing) && !levelWithoutUnit(cand) && (listing.unit ?? null) === (cand.unit ?? null),
    number: numbersAgree(listing, cand),
    street: !!listing.street && listing.street === cand.street,
    suburb: !!listing.suburb && suburbGroup(listing.suburb) === suburbGroup(cand.suburb),
    streetName: !!listing.streetName && listing.streetName === cand.streetName,
  };
}

/** Geocode query in the form the geocoder matches best: "902/417-419 Bourke Street, Surry Hills". */
export function geocodeQuery(a: NormalAddress, numberOverride?: string | null): string {
  const num = numberOverride ?? a.number ?? "";
  const unit = a.unit ? `${a.unit}/` : "";
  const suburb = a.suburbDisplay ? `, ${a.suburbDisplay}` : "";
  return `${unit}${num} ${a.streetDisplay ?? ""}`.replace(/\s+/g, " ").trim() + suburb;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
