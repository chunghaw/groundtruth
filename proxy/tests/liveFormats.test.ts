import { describe, expect, it, vi } from "vitest";
import { parseAddress, formatNormalised } from "@/lib/normalise";
import { buildIndex, detectColumns, rowsFromCsv } from "@/lib/addressIndex";
import { apiSuburbName, AREA_SUBURBS, isInArea, setAreaSuburbs } from "@/lib/area";
import { canonSuburb } from "@/lib/normalise";
import { resolve, type GeoCandidate, type ResolveDeps } from "@/lib/resolve";

// Formats observed from the live Microburbs geocoder and the organiser CSV on 2026-11-07.
const cand = (id: string, display: string, type = "unit"): GeoCandidate => ({
  id,
  name: display,
  display_name: display,
  abbr: display.toUpperCase().replace(/,/g, ""),
  property_type: type,
});
const req = (raw: string, bedrooms: number | null = null) => ({ source: "manual" as const, raw, parts: null, bedrooms });
function deps(cands: GeoCandidate[], extra: Partial<ResolveDeps> = {}): ResolveDeps {
  return { geocode: vi.fn(async () => ({ status: "ok" as const, candidates: cands })), index: null, isInArea, ...extra };
}

const CSV_HEADER = "gnaf_id,address,suburb,postcode,mb,block_type,latitude,longitude,unit_number,bedrooms,bathrooms,car_spaces,flats_in_building";
const CSV = [
  CSV_HEADER,
  'GANSW1,"Unit 41, 19-23 Forbes Street",Woolloomooloo,2011,1,Residential,-33.87,151.22,41,2,1,1,60',
  'GANSW2,"Unit 42, 19-23 Forbes Street",Woolloomooloo,2011,1,Residential,-33.87,151.22,42,1,1,,60',
  "GANSW3,1-17 Euston Road,Alexandria,2015,1,Residential,-33.90443245,151.19309238,,,,,1",
  'GANSW4,"Apartment 101, 92 Buckland Street",Alexandria,2015,1,Residential,-33.9,151.19,APARTMENT 101,3,2,1,18',
  'GANSW5,"Shop 1, 19-23 Forbes Street",Woolloomooloo,2011,1,Commercial,-33.87,151.22,SHOP 1,,,,60',
  'GANSW6,"Carspace 14, 19-23 Forbes Street",Woolloomooloo,2011,1,Residential,-33.87,151.22,CARSPACE 14,,,,60',
  'GANSW7,"Unit 14, 264A Bridge Road",Forest Lodge,2037,1,Residential,-33.88,151.18,14,1,1,,20',
].join("\n");

describe("live geocode display formats", () => {
  it("parses the UNIT prefix with slash", () => {
    expect(formatNormalised(parseAddress("UNIT 902/417-419 Bourke Street, Surry Hills"))).toBe("U902 · 417-419 · BOURKE ST · SURRY HILLS");
  });
  it("parses APARTMENT prefix and suffixed suburbs", () => {
    expect(formatNormalised(parseAddress("APARTMENT 20E/4 Distillery Drive, Pyrmont"))).toBe("U20E · 4 · DISTILLERY DR · PYRMONT");
    expect(parseAddress("UNIT 902/1 Sterling Circuit, Camperdown (NSW)").suburb).toBe("CAMPERDOWN");
    expect(parseAddress("15 Wilson Lane, Darlington (Sydney - NSW)").suburb).toBe("DARLINGTON");
  });
  it("a SHOP candidate never matches a residential unit with the same number", async () => {
    const r = await resolve(req("1/1-7 Bligh Street, Sydney NSW 2000"), deps([cand("G1", "SHOP 1/1-7 Bligh Street, Sydney")]));
    expect(r.state).not.toBe("EXACT");
  });
  it("other suburbs' unit-902 candidates are rejected", async () => {
    const r = await resolve(
      req("902/417-419 Bourke Street, Surry Hills NSW 2010"),
      deps([cand("GANSW716627274", "UNIT 902/417-419 Bourke Street, Surry Hills"), cand("X", "UNIT 902/1 Sterling Circuit, Camperdown (NSW)")]),
    );
    expect(r.state).toBe("EXACT");
    expect(r.gnafId).toBe("GANSW716627274");
  });
});

describe("area: the 29 suburbs the key covers", () => {
  it("has exactly 29 and excludes Paddington/Newtown/Annandale/St Peters", () => {
    expect(AREA_SUBURBS).toHaveLength(29);
    for (const s of ["Paddington", "Newtown", "Annandale", "St Peters"]) expect(isInArea(canonSuburb(s))).toBe(false);
    expect(isInArea(canonSuburb("Camperdown (NSW)"))).toBe(true);
    expect(isInArea(canonSuburb("The Rocks"))).toBe(true);
  });
  it("an API list never widens the area beyond the 29", () => {
    setAreaSuburbs(["Paddington", "Surry Hills"]);
    expect(isInArea("PADDINGTON")).toBe(false);
    expect(isInArea("SURRY HILLS")).toBe(true);
  });
  it("maps a base name back to the API's suffixed name", () => {
    expect(apiSuburbName("Camperdown")).toBe("Camperdown (NSW)");
    expect(apiSuburbName("DARLINGTON")).toBe("Darlington (Sydney - NSW)");
    expect(apiSuburbName("surry hills")).toBe("Surry Hills");
    expect(apiSuburbName("Paddington")).toBeNull();
  });
});

describe("organiser flats CSV", () => {
  it("detects the extra columns", () => {
    expect(detectColumns(CSV_HEADER.split(","))).toMatchObject({
      gnaf: "gnaf_id", address: "address", suburb: "suburb", postcode: "postcode",
      lat: "latitude", lng: "longitude", unit: "unit_number", bedrooms: "bedrooms", flats: "flats_in_building",
    });
  });
  it("reads unit/number/street from the address column and suburb from its own column; drops shops and car spaces", () => {
    const rows = rowsFromCsv(CSV);
    expect(rows.map((r) => r.gnafId)).toEqual(["GANSW1", "GANSW2", "GANSW3", "GANSW4", "GANSW7"]);
    expect(rows[0]).toMatchObject({ unit: "41", number: "19-23", suburb: "Woolloomooloo", postcode: "2011", lat: -33.87, lng: 151.22, bedrooms: 2, flats: 60 });
    expect(rows[2]).toMatchObject({ unit: null, number: "1-17", suburb: "Alexandria" });
    expect(rows[3]).toMatchObject({ unit: "101", number: "92" });
    const idx = buildIndex(rows);
    expect(idx.unitsAt("19|FORBES ST|WOOLLOOMOOLOO").map((u) => u.label)).toEqual([
      "41/19-23 Forbes Street, Woolloomooloo",
      "42/19-23 Forbes Street, Woolloomooloo",
    ]);
    expect(idx.byGnaf("GANSW3")).toMatchObject({ lat: -33.90443245, lng: 151.19309238, postcode: "2015" });
  });
});

describe("resolve with the CSV index", () => {
  const index = buildIndex(rowsFromCsv(CSV));
  it("EXACT exposes the matched home's location", async () => {
    const r = await resolve(req("41/19-23 Forbes Street, Woolloomooloo NSW 2011"), deps([cand("GANSW1", "UNIT 41/19-23 Forbes Street, Woolloomooloo")], { index }));
    expect(r.state).toBe("EXACT");
    expect(r.location).toEqual({ lat: -33.87, lng: 151.22 });
    expect(r.confidence).toBe(99);
  });
  it("narrows BUILDING candidates with CSV bedrooms, no API calls", async () => {
    const basics = vi.fn();
    const r = await resolve(req("19-23 Forbes Street, Woolloomooloo NSW 2011", 1), deps([], { index, basics }));
    expect(r.state).toBe("BUILDING");
    expect(r.candidates).toEqual([{ gnafId: "GANSW2", label: "42/19-23 Forbes Street, Woolloomooloo", bedrooms: 1 }]);
    expect(basics).not.toHaveBeenCalled();
    expect(r.location).toEqual({ lat: -33.87, lng: 151.22 });
  });
  it("accepts a neighbouring G-NAF locality only when the CSV row's postcode equals the listing's", async () => {
    const c = [cand("GANSW7", "UNIT 14/264A Bridge Road, Forest Lodge")];
    const ok = await resolve(req("14/264A Bridge Road, Glebe, NSW 2037"), deps(c, { index }));
    expect(ok.state).toBe("EXACT");
    expect(ok.receipt.suburbAlias).toBe(true);
    const noPc = await resolve(req("14/264A Bridge Road, Glebe"), deps(c, { index }));
    expect(noPc.state).not.toBe("EXACT");
    const noCsv = await resolve(req("14/264A Bridge Road, Glebe, NSW 2037"), deps(c));
    expect(noCsv.state).not.toBe("EXACT");
  });
  it("listing that omits the street type: EXACT only when the CSV confirms the unit", async () => {
    const idx = buildIndex(rowsFromCsv([CSV_HEADER, 'GANSW8,"Unit 4, 6A Greenknowe Avenue",Elizabeth Bay,2011,1,Residential,-33.87,151.23,4,2,1,,12'].join("\n")));
    const c = [cand("GANSW8", "UNIT 4/6A Greenknowe Avenue, Elizabeth Bay")];
    const ok = await resolve(req("4/6A Greenknowe, Elizabeth Bay NSW 2011"), deps(c, { index: idx }));
    expect(ok.state).toBe("EXACT");
    expect(ok.gnafId).toBe("GANSW8");
    const noCsv = await resolve(req("4/6A Greenknowe, Elizabeth Bay NSW 2011"), deps(c));
    expect(noCsv.state).toBe("CHOOSE");
  });
  it("CSV-only EXACT requires the full number to agree (174-182 listing vs 174-186 record)", async () => {
    const idx = buildIndex(rowsFromCsv([CSV_HEADER, 'G9,"Unit 903, 174-186 Goulburn Street",Surry Hills,2010,1,Residential,-33.88,151.21,903,2,1,,111'].join("\n")));
    const r = await resolve(req("Unit 903, 174-182 Goulburn Street, Surry Hills NSW 2010"), deps([], { index: idx }));
    expect(r.state).toBe("BUILDING");
  });
  it("a no-unit range listing never EXACT-matches a single-number record (30-34 vs 30)", async () => {
    const r = await resolve(req("30-34 Brougham Street, Potts Point NSW 2011"), deps([cand("G30", "30 Brougham Street, Potts Point", "unit")]));
    expect(r.state).not.toBe("EXACT");
  });
  it("a single G-NAF range record with no unit records stays EXACT even if the CSV counts 2 flats", async () => {
    const idx = buildIndex(rowsFromCsv([CSV_HEADER, "GR,45-49 Ralph Street,Alexandria,2015,1,Industrial,-33.91,151.2,,,,,2"].join("\n")));
    const r = await resolve(req("45-49 Ralph Street, Alexandria, NSW 2015"), deps([cand("GR", "45-49 Ralph Street, Alexandria")], { index: idx }));
    expect(r.state).toBe("EXACT");
    expect(r.location).toEqual({ lat: -33.91, lng: 151.2 });
  });
  it("index loaded: EXACT needs a CSV record; not_found caps at NO_MATCH (lone record) or BUILDING (others at the address)", async () => {
    const lone = await resolve(req("905 South Dowling Street, Zetland NSW 2017"), deps([cand("GZ", "905 South Dowling Street, Zetland")], { index }));
    expect(lone.state).toBe("NO_MATCH");
    expect(lone.message).toBe("Not in the City of Sydney residential address list");
    const many = await resolve(
      req("905 South Dowling Street, Zetland NSW 2017"),
      deps([cand("GZ", "905 South Dowling Street, Zetland"), cand("GZ2", "905 South Dowling Street, Zetland")], { index }),
    );
    expect(many.state).not.toBe("EXACT");
    const unit = await resolve(req("7/9 Foo Street, Zetland NSW 2017"), deps([cand("GU", "UNIT 7/9 Foo Street, Zetland"), cand("GU8", "UNIT 8/9 Foo Street, Zetland")], { index }));
    expect(unit.state).toBe("BUILDING");
    expect(unit.message).toBe("Not in the City of Sydney residential address list");
  });
  it("index NOT loaded: unchanged, a lone geocode record is EXACT", async () => {
    const r = await resolve(req("905 South Dowling Street, Zetland NSW 2017"), deps([cand("GZ", "905 South Dowling Street, Zetland")]));
    expect(r.state).toBe("EXACT");
  });
  it("index loaded, csv not_found: a 'house'-typed record with a no-unit listing may still be EXACT; 'unit'-typed may not", async () => {
    const house = await resolve(req("19 Alexander Street, Surry Hills NSW 2010"), deps([cand("GH", "19 Alexander Street, Surry Hills", "house")], { index }));
    expect(house.state).toBe("EXACT");
    expect(house.receipt.csv).toBe("not_found");
    const unitTyped = await resolve(req("905 South Dowling Street, Zetland NSW 2017"), deps([cand("GZ", "905 South Dowling Street, Zetland", "unit")], { index }));
    expect(unitTyped.state).toBe("NO_MATCH");
    const unitListing = await resolve(req("3/19 Alexander Street, Surry Hills NSW 2010"), deps([cand("GH3", "UNIT 3/19 Alexander Street, Surry Hills", "house")], { index }));
    expect(unitListing.state).not.toBe("EXACT");
  });
});
