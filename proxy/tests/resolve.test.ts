import { describe, expect, it, vi } from "vitest";
import { resolve, type ResolveDeps, type GeoCandidate } from "@/lib/resolve";
import { buildIndex } from "@/lib/addressIndex";
import { isInArea } from "@/lib/area";

const cand = (id: string, display: string, type = "unit"): GeoCandidate => ({
  id,
  name: display,
  display_name: display,
  abbr: display.toUpperCase(),
  property_type: type,
});

function deps(cands: GeoCandidate[] | "outside", extra: Partial<ResolveDeps> = {}): ResolveDeps & { geocode: ReturnType<typeof vi.fn> } {
  const geocode = vi.fn(async () => (cands === "outside" ? { status: "outside" as const } : { status: "ok" as const, candidates: cands }));
  return { geocode, index: null, isInArea, ...extra } as ResolveDeps & { geocode: ReturnType<typeof vi.fn> };
}

const req = (raw: string, bedrooms: number | null = null) => ({ source: "manual" as const, raw, parts: null, bedrooms });

describe("resolve", () => {
  it("OUT_OF_AREA without any API call", async () => {
    const d = deps([]);
    const r = await resolve(req("12 Smith Street, Parramatta NSW 2150"), d);
    expect(r.state).toBe("OUT_OF_AREA");
    expect(r.gnafId).toBeNull();
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("builds the unit/number street, suburb geocode query", async () => {
    const d = deps([]);
    await resolve(req("Unit 902, 417-419 Bourke Street, Surry Hills NSW 2010"), d);
    expect(d.geocode.mock.calls[0][0]).toBe("902/417-419 Bourke Street, Surry Hills");
  });

  it("EXACT when unit+number+street+suburb agree", async () => {
    const d = deps([
      cand("GANSW1", "901/417-419 Bourke Street, Surry Hills"),
      cand("GANSW2", "902/417-419 Bourke Street, Surry Hills"),
    ]);
    const r = await resolve(req("902/417-419 Bourke Street, Surry Hills, NSW 2010"), d);
    expect(r.state).toBe("EXACT");
    expect(r.gnafId).toBe("GANSW2");
    expect(r.confidence).toBeGreaterThanOrEqual(90);
    expect(r.receipt.checks).toEqual({ unit: true, number: true, street: true, suburb: true });
    expect(r.receipt.normalised).toBe("U902 · 417-419 · BOURKE ST · SURRY HILLS");
    expect(r.receipt.geocodeCandidates).toBe(2);
  });

  it("never EXACT when suburb differs (same street name elsewhere)", async () => {
    const d = deps([cand("GANSW9", "902/417 Bourke Street, Darlinghurst")]);
    const r = await resolve(req("902/417 Bourke Street, Surry Hills"), d);
    expect(r.state).toBe("NO_MATCH");
    expect(r.gnafId).toBeNull();
  });

  it("BUILDING when street address matches but unit does not; candidates from geocode without CSV", async () => {
    const d = deps([
      cand("GANSW1", "901/417-419 Bourke Street, Surry Hills"),
      cand("GANSW3", "903/417-419 Bourke Street, Surry Hills"),
    ]);
    const r = await resolve(req("902/417-419 Bourke Street, Surry Hills"), d);
    expect(r.state).toBe("BUILDING");
    expect(r.gnafId).toBeNull();
    expect(r.receipt.checks.unit).toBe(false);
    expect(r.candidates.map((c) => c.gnafId).sort()).toEqual(["GANSW1", "GANSW3"]);
  });

  it("BUILDING when listing has no unit but geocode returns units", async () => {
    const d = deps([cand("GANSW1", "1/10 Crown Street, Surry Hills"), cand("GANSW2", "2/10 Crown Street, Surry Hills")]);
    const r = await resolve(req("10 Crown Street, Surry Hills"), d);
    expect(r.state).toBe("BUILDING");
  });

  it("BUILDING candidates come from CSV when loaded", async () => {
    const index = buildIndex([
      { gnafId: "GANSW11", unit: "1", number: "10", street: "Crown Street", suburb: "Surry Hills" },
      { gnafId: "GANSW12", unit: "2", number: "10", street: "Crown Street", suburb: "Surry Hills" },
      { gnafId: "GANSW13", unit: "3", number: "10", street: "Crown Street", suburb: "Surry Hills" },
      { gnafId: "GANSW99", unit: "1", number: "12", street: "Crown Street", suburb: "Surry Hills" },
    ]);
    const d = deps([cand("GANSW11", "1/10 Crown Street, Surry Hills")], { index });
    const r = await resolve(req("10 Crown Street, Surry Hills"), d);
    expect(r.state).toBe("BUILDING");
    expect(r.candidates.map((c) => c.gnafId)).toEqual(["GANSW11", "GANSW12", "GANSW13"]);
  });

  it("house with no units at address -> EXACT", async () => {
    const d = deps([cand("GANSW5", "5 Bay Street, Glebe", "house")]);
    const r = await resolve(req("5 Bay Street, Glebe NSW 2037"), d);
    expect(r.state).toBe("EXACT");
    expect(r.gnafId).toBe("GANSW5");
  });

  it("no-unit listing at a strata address (CSV has units) is BUILDING even if geocode returns a base address", async () => {
    const index = buildIndex([
      { gnafId: "GANSW21", unit: "1", number: "5", street: "Bay Street", suburb: "Glebe" },
      { gnafId: "GANSW22", unit: "2", number: "5", street: "Bay Street", suburb: "Glebe" },
    ]);
    const d = deps([cand("GANSW5", "5 Bay Street, Glebe")], { index });
    const r = await resolve(req("5 Bay Street, Glebe"), d);
    expect(r.state).toBe("BUILDING");
  });

  it("CSV loaded and street address present but unit absent -> not EXACT", async () => {
    const index = buildIndex([{ gnafId: "GANSW11", unit: "1", number: "10", street: "Crown Street", suburb: "Surry Hills" }]);
    const d = deps([cand("GANSW77", "7/10 Crown Street, Surry Hills")], { index });
    const r = await resolve(req("7/10 Crown Street, Surry Hills"), d);
    expect(r.state).not.toBe("EXACT");
  });

  it("CSV confirmation raises confidence", async () => {
    const index = buildIndex([{ gnafId: "GANSW2", unit: "902", number: "417-419", street: "Bourke Street", suburb: "Surry Hills" }]);
    const withCsv = await resolve(req("902/417-419 Bourke St, Surry Hills"), deps([cand("GANSW2", "902/417-419 Bourke Street, Surry Hills")], { index }));
    const without = await resolve(req("902/417-419 Bourke St, Surry Hills"), deps([cand("GANSW2", "902/417-419 Bourke Street, Surry Hills")]));
    expect(withCsv.state).toBe("EXACT");
    expect(withCsv.confidence).toBeGreaterThan(without.confidence);
  });

  it("CHOOSE when street name matches but type differs", async () => {
    const d = deps([cand("GANSW1", "5 Riley Lane, Surry Hills"), cand("GANSW2", "5 Riley Place, Surry Hills")]);
    const r = await resolve(req("5 Riley Street, Surry Hills"), d);
    expect(r.state).toBe("CHOOSE");
    expect(r.gnafId).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });

  it("CHOOSE when two distinct GNAFs pass every check", async () => {
    const d = deps([cand("GANSW1", "5 Bay Street, Glebe", "house"), cand("GANSW2", "5 Bay Street, Glebe", "house")]);
    const r = await resolve(req("5 Bay Street, Glebe"), d);
    expect(r.state).toBe("CHOOSE");
  });

  it("geocode 403 maps to OUT_OF_AREA", async () => {
    const r = await resolve(req("5 Bay Street, Glebe"), deps("outside"));
    expect(r.state).toBe("OUT_OF_AREA");
  });

  it("retries with first-number variant when range finds nothing", async () => {
    const geocode = vi
      .fn()
      .mockResolvedValueOnce({ status: "ok", candidates: [] })
      .mockResolvedValueOnce({ status: "ok", candidates: [cand("GANSW2", "902/417 Bourke Street, Surry Hills")] });
    const r = await resolve(req("902/417-419 Bourke Street, Surry Hills"), { geocode, index: null, isInArea });
    expect(geocode.mock.calls[1][0]).toBe("902/417 Bourke Street, Surry Hills");
    expect(r.state).toBe("EXACT");
  });

  it("NO_MATCH on geocode error, with message", async () => {
    const geocode = vi.fn(async () => ({ status: "error" as const, message: "upstream 500" }));
    const r = await resolve(req("5 Bay Street, Glebe"), { geocode, index: null, isInArea });
    expect(r.state).toBe("NO_MATCH");
    expect(r.message).toMatch(/500/);
  });

  it("NO_MATCH when address cannot be parsed", async () => {
    const d = deps([]);
    const r = await resolve(req("Contact agent"), d);
    expect(r.state).toBe("NO_MATCH");
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("narrows BUILDING candidates by buyer-typed bedrooms", async () => {
    const basics = vi.fn(async (id: string) => ({ bed_count: id === "GANSW12" ? 2 : 1 }));
    const index = buildIndex([
      { gnafId: "GANSW11", unit: "1", number: "10", street: "Crown Street", suburb: "Surry Hills" },
      { gnafId: "GANSW12", unit: "2", number: "10", street: "Crown Street", suburb: "Surry Hills" },
    ]);
    const d = deps([cand("GANSW11", "1/10 Crown Street, Surry Hills")], { index, basics });
    const r = await resolve(req("10 Crown Street, Surry Hills", 2), d);
    expect(r.state).toBe("BUILDING");
    expect(r.candidates).toEqual([{ gnafId: "GANSW12", label: "2/10 Crown Street, Surry Hills", bedrooms: 2 }]);
  });
});

describe("resolve hardening", () => {
  it("level with no unit is never EXACT", async () => {
    const r = await resolve(req("Level 8, 1 Alfred Street, Sydney NSW 2000"), deps([cand("G1", "1 Alfred Street, Sydney")]));
    expect(r.state).toBe("BUILDING");
  });
  it("candidate with a level and no unit is never EXACT", async () => {
    const r = await resolve(req("1 Alfred Street, Sydney NSW 2000"), deps([cand("G1", "LEVEL 8, 1 ALFRED STREET, SYDNEY")]));
    expect(r.state).not.toBe("EXACT");
  });
  it("listing 45 vs candidate range 45-49 is not EXACT", async () => {
    const r = await resolve(req("45 Smith Street, Sydney"), deps([cand("G1", "45-49 Smith Street, Sydney", "house")]));
    expect(r.state).not.toBe("EXACT");
  });
  it("ambiguous & unit gives BUILDING", async () => {
    const r = await resolve(req("330&330A/8 Lachlan Street, Waterloo"), deps([cand("G1", "1/8 Lachlan Street, Waterloo"), cand("G2", "2/8 Lachlan Street, Waterloo")]));
    expect(r.state).toBe("BUILDING");
  });
  it("alias suburb allows EXACT with matching postcode and records alias", async () => {
    const r = await resolve(req("12 Hickson Road, Sydney NSW 2000"), deps([cand("G1", "12 Hickson Road, Barangaroo NSW 2000", "house")]));
    expect(r.state).toBe("EXACT");
    expect(r.receipt.suburbAlias).toBe(true);
  });
  it("alias suburb with differing postcode is not EXACT", async () => {
    const r = await resolve(req("12 Hickson Road, Sydney NSW 2000"), deps([cand("G1", "12 Hickson Road, Barangaroo NSW 2001", "house")]));
    expect(r.state).not.toBe("EXACT");
  });
});
