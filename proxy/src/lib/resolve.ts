import {
  canonSuburb,
  compareAddresses,
  formatNormalised,
  geocodeQuery,
  normaliseRequest,
  parseAddress,
  streetKey,
  type AddressParts,
  type Checks,
  type NormalAddress,
} from "./normalise";
import type { AddressIndex, IndexRow } from "./addressIndex";

export type ResolveState = "EXACT" | "BUILDING" | "CHOOSE" | "NO_MATCH" | "OUT_OF_AREA";

export interface ResolveRequest {
  source: "rea" | "domain" | "manual";
  raw: string;
  parts: AddressParts | null;
  bedrooms: number | null;
}

export interface Candidate {
  gnafId: string | null;
  label: string;
  bedrooms: number | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ResolveResponse {
  state: ResolveState;
  /** Where the matched home (EXACT) or the building (BUILDING) is, from the supplied CSV. */
  location?: LatLng | null;
  confidence: number;
  gnafId: string | null;
  receipt: {
    read: string;
    normalised: string;
    checks: Checks;
    geocodeCandidates: number;
    csv: "confirmed" | "not_found" | "not_loaded";
    query: string | null;
    /** True when EXACT relied on a CBD suburb alias (e.g. Sydney vs Barangaroo). */
    suburbAlias?: boolean;
  };
  candidates: Candidate[];
  message: string;
}

export interface GeoCandidate {
  id: string;
  name: string;
  display_name: string;
  abbr: string;
  property_type: string | null;
}

export type GeocodeResult =
  | { status: "ok"; candidates: GeoCandidate[] }
  | { status: "outside" }
  | { status: "error"; message: string };

export interface ResolveDeps {
  geocode(query: string): Promise<GeocodeResult>;
  basics?(gnafId: string): Promise<{ bed_count: number | null } | null>;
  index: AddressIndex | null;
  isInArea(suburbCanon: string | null): boolean;
}

interface Scored {
  c: GeoCandidate;
  a: NormalAddress;
  checks: ReturnType<typeof compareAddresses>;
}

const MAX_CANDIDATES = 200;
const MAX_BEDROOM_LOOKUPS = 30;
const NOT_IN_LIST = "Not in the City of Sydney residential address list";
const NO_CHECKS: Checks ={ unit: false, number: false, street: false, suburb: false };

/** Geocoder records that are not homes: "SHOP 1/1-7 Bligh Street". Their unit must never equal a home's. */
const NON_HOME_RE = /^\s*(SHOP|SUITE|CARSPACE|CAR SPACE|OFFICE|STORE|KIOSK|ROOM|GARAGE|BASEMENT|SITE|SHED|WAREHOUSE|STALL|MEZZANINE|CARPARK|MARINA|BERTH)\s+([A-Z0-9]+)\s*\//i;

function parseCandidate(c: GeoCandidate): NormalAddress {
  const display = c.display_name || c.name || "";
  const fromDisplay = parseAddress(display);
  const a = fromDisplay.number && fromDisplay.street && fromDisplay.suburb ? fromDisplay : parseAddress(c.abbr || "");
  const nonHome = display.match(NON_HOME_RE) ?? (c.abbr || "").match(NON_HOME_RE);
  return nonHome ? { ...a, unit: `${nonHome[1].toUpperCase()} ${a.unit ?? nonHome[2]}` } : a;
}

function score(listing: NormalAddress, cands: GeoCandidate[]): Scored[] {
  return cands.map((c) => {
    const a = parseCandidate(c);
    return { c, a, checks: compareAddresses(listing, a) };
  });
}

const streetMatch = (s: Scored): boolean => s.checks.number && s.checks.street && s.checks.suburb;

function uniqueById(list: Scored[]): Scored[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.c.id) ? false : (seen.add(s.c.id), true)));
}

function toCandidate(s: Scored): Candidate {
  return { gnafId: s.c.id, label: s.c.display_name || s.c.name, bedrooms: null };
}

function fromIndex(r: IndexRow): Candidate {
  return { gnafId: r.gnafId, label: r.label, bedrooms: r.bedrooms ?? null };
}

function locOf(r: IndexRow | null | undefined): LatLng | null {
  return r && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
}

function bestChecks(scored: Scored[]): Checks {
  const rank = (c: Checks) => Number(c.unit) + Number(c.number) * 2 + Number(c.street) * 2 + Number(c.suburb) * 2;
  const best = [...scored].sort((x, y) => rank(y.checks) - rank(x.checks))[0];
  if (!best) return NO_CHECKS;
  const { unit, number, street, suburb } = best.checks;
  return { unit, number, street, suburb };
}

async function narrowByBedrooms(cands: Candidate[], bedrooms: number | null, deps: ResolveDeps): Promise<Candidate[]> {
  if (!bedrooms) return cands;
  if (cands.some((c) => c.bedrooms != null)) {
    // Supplied CSV already knows bedrooms: narrow locally, no API calls.
    const matching = cands.filter((c) => c.bedrooms === bedrooms);
    return matching.length > 0 ? matching : cands;
  }
  if (!deps.basics) return cands;
  const lookable = cands.filter((c) => c.gnafId).slice(0, MAX_BEDROOM_LOOKUPS);
  if (lookable.length === 0 || lookable.length < cands.length) return cands;
  const annotated = await Promise.all(
    lookable.map(async (c) => {
      try {
        const b = await deps.basics!(c.gnafId!);
        return { ...c, bedrooms: b?.bed_count ?? null };
      } catch {
        return c;
      }
    }),
  );
  const matching = annotated.filter((c) => c.bedrooms === bedrooms);
  return matching.length > 0 ? matching : annotated;
}

export async function resolve(req: ResolveRequest, deps: ResolveDeps): Promise<ResolveResponse> {
  const listing = normaliseRequest(req);
  const read = req.raw || Object.values(req.parts ?? {}).filter(Boolean).join(" ");
  const base = {
    read,
    normalised: formatNormalised(listing),
    checks: NO_CHECKS,
    geocodeCandidates: 0,
    csv: (deps.index ? "not_found" : "not_loaded") as ResolveResponse["receipt"]["csv"],
    query: null as string | null,
  };
  const reply = (r: Partial<ResolveResponse> & Pick<ResolveResponse, "state" | "message">, receipt: Partial<ResolveResponse["receipt"]> = {}): ResolveResponse => ({
    confidence: 0,
    gnafId: null,
    candidates: [],
    ...r,
    receipt: { ...base, ...receipt },
  });

  if (!listing.number || !listing.street) {
    return reply({ state: "NO_MATCH", message: "Couldn't read a street number and street name from this address." });
  }
  if (!deps.isInArea(listing.suburb)) {
    return reply({ state: "OUT_OF_AREA", message: `${listing.suburbDisplay ?? "This suburb"} is outside the City of Sydney area covered by Microburbs data.` });
  }

  let query = geocodeQuery(listing);
  let geo = await deps.geocode(query);
  if (geo.status === "outside") return reply({ state: "OUT_OF_AREA", message: "Microburbs reports this address is outside the covered area." }, { query });
  if (geo.status === "error") return reply({ state: "NO_MATCH", message: `Address lookup failed: ${geo.message}` }, { query });

  let scored = score(listing, geo.candidates);
  if (!scored.some(streetMatch) && listing.number.includes("-") && listing.numberFirst) {
    const retryQuery = geocodeQuery(listing, listing.numberFirst);
    const retry = await deps.geocode(retryQuery);
    if (retry.status === "ok" && retry.candidates.length > 0) {
      query = retryQuery;
      geo = retry;
      scored = score(listing, retry.candidates);
    }
  }
  const nGeo = geo.status === "ok" ? geo.candidates.length : 0;
  const receipt = { geocodeCandidates: nGeo, query };

  const rowOf = (id: string | null): IndexRow | null => (id && deps.index?.byGnaf ? deps.index.byGnaf(id) : null);
  // A neighbouring G-NAF locality (Glebe listing, Forest Lodge record) only when the supplied CSV
  // puts that exact record in the listing's own postcode.
  const postcodeNeighbour = (s: Scored): boolean =>
    !s.checks.suburb && !!listing.postcode && rowOf(s.c.id)?.postcode === listing.postcode;
  const matchesStreet = (s: Scored): boolean => s.checks.number && s.checks.street && (s.checks.suburb || postcodeNeighbour(s));
  const streetMatched = uniqueById(scored.filter(matchesStreet));
  const aliasUsed = (s: Scored): boolean => canonSuburb(listing.suburb) !== canonSuburb(s.a.suburb);
  const aliasOk = (s: Scored): boolean =>
    postcodeNeighbour(s) || !aliasUsed(s) || !listing.postcode || !s.a.postcode || listing.postcode === s.a.postcode;
  const exact = streetMatched.filter((s) => s.checks.unit && aliasOk(s));
  const csvUnits = deps.index ? deps.index.unitsAt(streetKey(listing)) : [];
  const csvStrata = csvUnits.some((u) => u.unit);
  const geoStrata = streetMatched.some((s) => s.a.unit);
  const allTrue: Checks = { unit: true, number: true, street: true, suburb: true };
  const unitMissing: Checks = { unit: false, number: true, street: true, suburb: true };

  const building = async (message: string): Promise<ResolveResponse> => {
    const pool = csvUnits.length > 0 ? csvUnits.map(fromIndex) : streetMatched.map(toCandidate);
    const candidates = await narrowByBedrooms(pool.slice(0, MAX_CANDIDATES), req.bedrooms, deps);
    return reply(
      { state: "BUILDING", confidence: 60, candidates, message, location: locOf(csvUnits.find((u) => u.lat != null)) },
      { ...receipt, checks: unitMissing, csv: csvUnits.length > 0 ? "confirmed" : base.csv },
    );
  };

  if (exact.length === 1) {
    const e = exact[0];
    if (!listing.unit && (geoStrata || csvStrata)) {
      return building("This street address has several homes; pick the unit being sold.");
    }
    if (!listing.unit && listing.number.includes("-") && e.a.number !== listing.number) {
      // "30-34 X St" with no unit is a building; a lone "30 X St" record is not proof of one home.
      return building("The listing gives a number range; the matching record covers only part of it.");
    }
    let csv: ResolveResponse["receipt"]["csv"] = base.csv;
    let confidence = 90;
    const own = rowOf(e.c.id);
    let location = locOf(own);
    if (own) {
      // The supplied CSV holds this exact G-NAF record: it must agree on the unit.
      if ((own.unit ?? null) !== (listing.unit ?? null)) {
        return building("The address list disagrees with the geocoder on this unit; pick the unit.");
      }
      csv = "confirmed";
      confidence = 99;
    } else if (deps.index) {
      if (csvUnits.length > 0) {
        const row = csvUnits.find((u) => u.unit === listing.unit);
        if (!row) return building(`Unit ${listing.unit} isn't in the supplied address list for this building; pick the unit.`);
        csv = "confirmed";
        confidence = row.gnafId === e.c.id ? 99 : 95;
        location = locOf(row);
      } else {
        // Index (flats only) has no record for this home. Only a G-NAF record typed 'house' with a
        // no-unit listing may still be EXACT; a 'unit'-typed record without a flat record is ambiguous.
        const house = !listing.unit && (e.c.property_type ?? "").toLowerCase() === "house";
        if (!house) {
          if (streetMatched.length > 1) return building(NOT_IN_LIST);
          return reply({ state: "NO_MATCH", message: NOT_IN_LIST }, { ...receipt, checks: allTrue, csv: "not_found" });
        }
        confidence = 80;
      }
    }
    return reply(
      { state: "EXACT", confidence, gnafId: e.c.id, location, candidates: [toCandidate(e)], message: "Matched unit, number, street and suburb." },
      { ...receipt, checks: allTrue, csv, ...(aliasUsed(e) ? { suburbAlias: true } : {}) },
    );
  }

  if (exact.length > 1) {
    return reply(
      { state: "CHOOSE", confidence: 40, candidates: exact.map(toCandidate), message: "Several records match this exact address; pick one." },
      { ...receipt, checks: allTrue },
    );
  }

  if (streetMatched.length > 0 || csvUnits.length > 0) {
    const csvExact = listing.unit
      ? csvUnits.filter((u) => u.unit === listing.unit && u.gnafId && (u.number === listing.number || (!u.number.includes("-") && u.number === listing.numberFirst && listing.number!.includes("-"))))
      : [];
    if (csvExact.length === 1) {
      return reply(
        { state: "EXACT", confidence: 85, gnafId: csvExact[0].gnafId, location: locOf(csvExact[0]), candidates: [fromIndex(csvExact[0])], message: "Matched via the supplied address list." },
        { ...receipt, checks: allTrue, csv: "confirmed" },
      );
    }
    return building(
      listing.unit
        ? `Found the building but not unit ${listing.unit}; pick the unit.`
        : "Found the building but the listing doesn't name a unit; pick the unit.",
    );
  }

  const near = uniqueById(
    scored.filter((s) => s.checks.number && s.checks.suburb && s.checks.streetName && !s.checks.street),
  );
  // Listing omitted the street type ("6A Greenknowe"): accept a single same-name record only when
  // the supplied CSV holds that record with the listing's unit.
  if (near.length === 1 && !listing.streetType && near[0].checks.unit) {
    const own = rowOf(near[0].c.id);
    if (own && (own.unit ?? null) === (listing.unit ?? null) && (listing.unit || (own.flats ?? 1) <= 1)) {
      return reply(
        { state: "EXACT", confidence: 75, gnafId: near[0].c.id, location: locOf(own), candidates: [toCandidate(near[0])], message: "Matched; the listing omits the street type." },
        { ...receipt, checks: allTrue, csv: "confirmed" },
      );
    }
  }
  if (near.length > 0) {
    return reply(
      { state: "CHOOSE", confidence: 30, candidates: near.map(toCandidate), message: "Same street name with a different street type; pick the right one." },
      { ...receipt, checks: bestChecks(near) },
    );
  }

  return reply(
    { state: "NO_MATCH", message: nGeo === 0 ? "No address records found." : "No address record agrees on number, street and suburb." },
    { ...receipt, checks: bestChecks(scored) },
  );
}
