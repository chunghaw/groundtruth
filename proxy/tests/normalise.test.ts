import { describe, expect, it } from "vitest";
import {
  canonStreet,
  canonSuburb,
  canonUnit,
  numbersAgree,
  suburbGroup,
  canonNumber,
  parseStreetLine,
  parseAddress,
  normaliseRequest,
  formatNormalised,
  compareAddresses,
  streetKey,
} from "@/lib/normalise";

describe("canonStreet", () => {
  it.each([
    ["Bourke Street", "BOURKE ST"],
    ["bourke st", "BOURKE ST"],
    ["Bourke St.", "BOURKE ST"],
    ["Crown Road", "CROWN RD"],
    ["Elizabeth Bay Rd", "ELIZABETH BAY RD"],
    ["Macleay Avenue", "MACLEAY AVE"],
    ["Wentworth Parade", "WENTWORTH PDE"],
    ["Hickson Drive", "HICKSON DR"],
    ["Little Riley Lane", "LITTLE RILEY LANE"],
    ["Little Riley La", "LITTLE RILEY LANE"],
    ["Wilson Place", "WILSON PL"],
    ["Darling Crescent", "DARLING CRES"],
    ["Wellington Terrace", "WELLINGTON TCE"],
    ["Pacific Highway", "PACIFIC HWY"],
    ["Taylor Square", "TAYLOR SQ"],
    ["Shelley Way", "SHELLEY WAY"],
    ["Ward Close", "WARD CL"],
    ["Fitzroy Court", "FITZROY CT"],
    ["Bunn Boulevard", "BUNN BVD"],
    ["Bunn Blvd", "BUNN BVD"],
    ["O'Connell Street", "OCONNELL ST"],
    ["Saint Johns Road", "ST JOHNS RD"],
    ["St Johns Rd", "ST JOHNS RD"],
    ["  george   street ", "GEORGE ST"],
    ["King Street North", "KING ST N"],
    ["Broadway", "BROADWAY"],
  ])("%s -> %s", (input, expected) => {
    expect(canonStreet(input)).toBe(expected);
  });
});

describe("canonSuburb", () => {
  it.each([
    ["Surry Hills", "SURRY HILLS"],
    ["surry   hills", "SURRY HILLS"],
    ["Surry Hills NSW 2010", "SURRY HILLS"],
    ["Sydney (NSW)", "SYDNEY"],
    ["The Rocks", "THE ROCKS"],
  ])("%s -> %s", (input, expected) => {
    expect(canonSuburb(input)).toBe(expected);
  });
});

describe("canonUnit / canonNumber", () => {
  it("strips leading zeros on numeric units only", () => {
    expect(canonUnit("0902")).toBe("902");
    expect(canonUnit("g03")).toBe("G3");
    expect(canonUnit("C902")).toBe("C902");
    expect(canonUnit("20e")).toBe("20E");
    expect(canonUnit("")).toBeNull();
    expect(canonUnit(null)).toBeNull();
  });
  it("keeps ranges and exposes the first number", () => {
    expect(canonNumber("417-419")).toEqual({ number: "417-419", first: "417" });
    expect(canonNumber("417 - 419")).toEqual({ number: "417-419", first: "417" });
    expect(canonNumber("1a")).toEqual({ number: "1A", first: "1A" });
    expect(canonNumber("12A-14")).toEqual({ number: "12A-14", first: "12A" });
    expect(canonNumber(null)).toEqual({ number: null, first: null });
  });
});

describe("parseStreetLine", () => {
  it.each([
    ["902/417-419 Bourke Street", { unit: "902", number: "417-419", street: "BOURKE ST" }],
    ["Unit 903, 174-182 Goulburn Street", { unit: "903", number: "174-182", street: "GOULBURN ST" }],
    ["Apartment 12, 5 Bay Street", { unit: "12", number: "5", street: "BAY ST" }],
    ["Apt 4 22 Crown St", { unit: "4", number: "22", street: "CROWN ST" }],
    ["Suite 1, 10 Pitt Street", { unit: "1", number: "10", street: "PITT ST" }],
    ["Level 9, 902/417 Bourke Street", { unit: "902", number: "417", street: "BOURKE ST" }],
    ["Level 3 Unit 5, 7 Pitt St", { unit: "5", number: "7", street: "PITT ST" }],
    ["G03/12 Pyrmont Bridge Road", { unit: "G3", number: "12", street: "PYRMONT BRIDGE RD" }],
    ["C902, 1 Bunn St", { unit: "C902", number: "1", street: "BUNN ST" }],
    ["20E/88 Lower Fort Street", { unit: "20E", number: "88", street: "LOWER FORT ST" }],
    ["1A Hill Street", { unit: null, number: "1A", street: "HILL ST" }],
    ["27 Arlington St", { unit: null, number: "27", street: "ARLINGTON ST" }],
  ])("%s", (line, expected) => {
    const r = parseStreetLine(line);
    expect({ unit: r.unit, number: r.number, street: r.street }).toEqual(expected);
  });
});

describe("parseAddress", () => {
  it("parses the contract example", () => {
    const a = parseAddress("902/417-419 Bourke Street, Surry Hills, NSW 2010");
    expect(a).toMatchObject({
      unit: "902",
      number: "417-419",
      numberFirst: "417",
      street: "BOURKE ST",
      suburb: "SURRY HILLS",
      state: "NSW",
      postcode: "2010",
    });
  });
  it("parses suburb with state and postcode in same segment", () => {
    expect(parseAddress("5 Bay Street, Glebe NSW 2037")).toMatchObject({ number: "5", street: "BAY ST", suburb: "GLEBE" });
  });
  it("parses comma-less abbr labels by locating the street type", () => {
    expect(parseAddress("27 ARLINGTON ST BELMONT NORTH")).toMatchObject({ number: "27", street: "ARLINGTON ST", suburb: "BELMONT NORTH" });
  });
  it("parses Unit-comma form with suburb", () => {
    expect(parseAddress("Unit 903, 174-182 Goulburn Street, Surry Hills")).toMatchObject({
      unit: "903",
      number: "174-182",
      street: "GOULBURN ST",
      suburb: "SURRY HILLS",
    });
  });
});

describe("normaliseRequest", () => {
  it("prefers parts but tolerates unit/number packed into number", () => {
    const a = normaliseRequest({
      raw: "ignored",
      parts: { unit: null, number: "902/417-419", street: "Bourke Street", suburb: "Surry Hills", state: "NSW", postcode: "2010" },
    });
    expect(a).toMatchObject({ unit: "902", number: "417-419", street: "BOURKE ST", suburb: "SURRY HILLS" });
  });
  it("falls back to raw when parts is null", () => {
    const a = normaliseRequest({ raw: "Level 2, 4/10 Crown Street, Surry Hills NSW 2010", parts: null });
    expect(a).toMatchObject({ unit: "4", number: "10", street: "CROWN ST", suburb: "SURRY HILLS" });
  });
  it("formats the receipt string", () => {
    const a = parseAddress("902/417-419 Bourke Street, Surry Hills, NSW 2010");
    expect(formatNormalised(a)).toBe("U902 · 417-419 · BOURKE ST · SURRY HILLS");
    expect(streetKey(a)).toBe("417|BOURKE ST|SURRY HILLS");
  });
});

describe("compareAddresses", () => {
  const listing = parseAddress("902/417-419 Bourke Street, Surry Hills");
  it("all agree", () => {
    expect(compareAddresses(listing, parseAddress("902/417-419 Bourke Street, Surry Hills"))).toMatchObject({
      unit: true, number: true, street: true, suburb: true,
    });
  });
  it("range vs first number agrees", () => {
    expect(compareAddresses(listing, parseAddress("902/417 Bourke Street, Surry Hills")).number).toBe(true);
  });
  it("range vs last number does NOT agree", () => {
    expect(compareAddresses(listing, parseAddress("902/419 Bourke Street, Surry Hills")).number).toBe(false);
  });
  it("different unit fails unit only", () => {
    expect(compareAddresses(listing, parseAddress("903/417-419 Bourke Street, Surry Hills"))).toMatchObject({
      unit: false, number: true, street: true, suburb: true,
    });
  });
  it("1A vs 1 does not agree", () => {
    expect(compareAddresses(parseAddress("1A Hill St, Glebe"), parseAddress("1 Hill St, Glebe")).number).toBe(false);
  });
  it("street type differs -> street false but streetName true", () => {
    const c = compareAddresses(parseAddress("5 Riley Street, Surry Hills"), parseAddress("5 Riley Lane, Surry Hills"));
    expect(c.street).toBe(false);
    expect(c.streetName).toBe(true);
  });
  it("missing unit on listing vs unit on candidate is a unit mismatch", () => {
    expect(compareAddresses(parseAddress("417 Bourke St, Surry Hills"), parseAddress("902/417 Bourke St, Surry Hills")).unit).toBe(false);
  });
});

describe("hardening: level, ranges, dashes, aliases, unit zeros", () => {
  it("flags a stripped level with no unit", () => {
    expect(parseAddress("Level 8, 1 Alfred Street, Sydney NSW 2000")).toMatchObject({ unit: null, number: "1", hadLevel: true });
    expect(parseAddress("LEVEL 8, 1 ALFRED STREET, SYDNEY")).toMatchObject({ unit: null, hadLevel: true });
  });
  it("Level 8/1 Alfred Street reads number 1", () => {
    expect(parseAddress("Level 8/1 Alfred Street, Sydney NSW 2000")).toMatchObject({ unit: null, number: "1", hadLevel: true });
    expect(normaliseRequest({ parts: { unit: "Level 8", number: "1", street: "Alfred Street", suburb: "Sydney" } })).toMatchObject({ unit: null, number: "1", hadLevel: true });
  });
  it("does not treat range overlap as agreement", () => {
    const p = (s: string) => parseAddress(`${s} Smith Street, Sydney`);
    expect(numbersAgree(p("45-47"), p("45-49"))).toBe(false);
    expect(numbersAgree(p("45"), p("45-49"))).toBe(false);
    expect(numbersAgree(p("45-49"), p("45-49"))).toBe(true);
    expect(numbersAgree(p("417-419"), p("417"))).toBe(true);
    expect(numbersAgree(p("417-419"), p("419"))).toBe(false);
  });
  it("maps unicode dashes to hyphen", () => {
    expect(parseAddress("417–419 Bourke Street, Surry Hills").number).toBe("417-419");
    expect(parseAddress("417—419 Bourke Street, Surry Hills").number).toBe("417-419");
    expect(parseAddress("417−419 Bourke Street, Surry Hills").number).toBe("417-419");
  });
  it("accepts & in slash units", () => {
    expect(parseAddress("330&330A/8 Lachlan Street, Waterloo")).toMatchObject({ number: "8", unit: "330&330A" });
  });
  it("canonUnit strips leading zeros", () => {
    expect(canonUnit("G01")).toBe(canonUnit("G1"));
    expect(canonUnit("05")).toBe("5");
  });
  it("groups CBD suburbs", () => {
    expect(suburbGroup("Barangaroo")).toBe(suburbGroup("Sydney"));
    expect(suburbGroup("The Rocks")).toBe(suburbGroup("Haymarket"));
    expect(suburbGroup("Surry Hills")).toBe("SURRY HILLS");
  });
});
