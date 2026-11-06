import { describe, expect, it } from "vitest";
import { buildIndex, detectColumns, rowsFromCsv } from "@/lib/addressIndex";

describe("detectColumns", () => {
  it("detects GNAF-style headers", () => {
    const m = detectColumns(["ADDRESS_DETAIL_PID", "FLAT_NUMBER", "NUMBER_FIRST", "NUMBER_LAST", "STREET_NAME", "STREET_TYPE_CODE", "LOCALITY_NAME", "POSTCODE"]);
    expect(m).toMatchObject({
      gnaf: "ADDRESS_DETAIL_PID",
      unit: "FLAT_NUMBER",
      number: "NUMBER_FIRST",
      numberLast: "NUMBER_LAST",
      streetName: "STREET_NAME",
      streetType: "STREET_TYPE_CODE",
      suburb: "LOCALITY_NAME",
    });
  });
  it("detects friendly headers", () => {
    expect(detectColumns(["gnaf_id", "unit", "street_number", "street", "suburb"])).toMatchObject({
      gnaf: "gnaf_id",
      unit: "unit",
      number: "street_number",
      street: "street",
      suburb: "suburb",
    });
  });
  it("falls back to a full address column", () => {
    expect(detectColumns(["id", "full_address", "lat", "lon"])).toMatchObject({ address: "full_address", gnaf: "id" });
  });
});

describe("rowsFromCsv", () => {
  it("parses structured columns incl. range and unit prefix", () => {
    const csv = [
      "ADDRESS_DETAIL_PID,FLAT_NUMBER,NUMBER_FIRST,NUMBER_LAST,STREET_NAME,STREET_TYPE_CODE,LOCALITY_NAME",
      "GANSW1,902,417,419,BOURKE,STREET,SURRY HILLS",
      "GANSW2,,5,,BAY,STREET,GLEBE",
    ].join("\n");
    const rows = rowsFromCsv(csv);
    expect(rows[0]).toMatchObject({ gnafId: "GANSW1", unit: "902", number: "417-419", street: "BOURKE STREET", suburb: "SURRY HILLS" });
    expect(rows[1]).toMatchObject({ gnafId: "GANSW2", unit: null, number: "5" });
  });
  it("parses a full-address column", () => {
    const csv = 'id,address\nGANSW7,"Unit 3, 10 Crown Street, Surry Hills NSW 2010"\n';
    const rows = rowsFromCsv(csv);
    expect(rows[0]).toMatchObject({ gnafId: "GANSW7", unit: "3", number: "10", street: "CROWN ST", suburb: "SURRY HILLS" });
  });
  it("honours an explicit mapping", () => {
    const csv = "A,B,C,D\nGANSW8,4,Pitt St,Sydney\n";
    const rows = rowsFromCsv(csv, { gnaf: "A", number: "B", street: "C", suburb: "D" });
    expect(rows[0]).toMatchObject({ gnafId: "GANSW8", number: "4", street: "Pitt St", suburb: "Sydney" });
  });
});

describe("buildIndex", () => {
  const idx = buildIndex([
    { gnafId: "G1", unit: "1", number: "10", street: "Crown Street", suburb: "Surry Hills" },
    { gnafId: "G2", unit: "2", number: "10", street: "CROWN ST", suburb: "SURRY HILLS" },
    { gnafId: "G3", unit: null, number: "417-419", street: "Bourke St", suburb: "Surry Hills" },
  ]);
  it("groups units by normalised (first number, street, suburb)", () => {
    expect(idx.unitsAt("10|CROWN ST|SURRY HILLS").map((r) => r.gnafId)).toEqual(["G1", "G2"]);
    expect(idx.unitsAt("417|BOURKE ST|SURRY HILLS").map((r) => r.gnafId)).toEqual(["G3"]);
    expect(idx.unitsAt("99|NOWHERE ST|SYDNEY")).toEqual([]);
    expect(idx.size).toBe(3);
  });
  it("sorts units naturally", () => {
    const i2 = buildIndex([
      { gnafId: "a", unit: "10", number: "1", street: "X St", suburb: "Glebe" },
      { gnafId: "b", unit: "2", number: "1", street: "X St", suburb: "Glebe" },
      { gnafId: "c", unit: "G01", number: "1", street: "X St", suburb: "Glebe" },
    ]);
    expect(i2.unitsAt("1|X ST|GLEBE").map((r) => r.unit)).toEqual(["2", "10", "G1"]);
  });
});
