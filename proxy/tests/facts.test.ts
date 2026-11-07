import { describe, expect, it, vi } from "vitest";
import { getFacts, stripPublicHousing, type FactsFetcher } from "@/lib/facts";
import { mockUpstream } from "@/lib/mock";

const ok = (data: unknown) => ({ status: 200, body: { data } });

describe("stripPublicHousing", () => {
  it("removes public-housing keys and items at any depth", () => {
    const out = stripPublicHousing({
      flood: [{ name: "Flood", value: "x" }],
      public_housing: [{ name: "Public Housing", value: "14%" }],
      nested: { public_housing_pct: 3, keep: 1, list: [{ name: "Public Housing" }, { name: "Heritage" }] },
    });
    expect(out).toEqual({ flood: [{ name: "Flood", value: "x" }], nested: { keep: 1, list: [{ name: "Heritage" }] } });
    expect(JSON.stringify(out)).not.toMatch(/public.?housing/i);
  });
});

describe("getFacts", () => {
  it("fetches in parallel, trims, and strips public housing", async () => {
    const calls: string[] = [];
    const fetcher: FactsFetcher = vi.fn(async (path: string) => {
      calls.push(path);
      if (path.endsWith("/risks/all"))
        return ok({
          flood: [{ name: "Flood", on_property: false, nearest_distance_m: 257, value: "Not on property", geojson: { big: true } }],
          public_housing: [{ name: "Public Housing", value: "14.5%" }],
        });
      if (/\/properties\/[^/]+\/profile$/.test(path)) return ok({ suburb: "Surry Hills" });
      if (path.includes("/market/strata-levies")) return ok({ median_levy_annual: 4200, n_properties: 300, area_name: "Surry Hills" });
      if (path.endsWith("/valuation/avm")) return ok({ predicted_price: 1, predicted_price_low: 0, predicted_price_high: 2, prediction_date: "2026-01-01" });
      if (path.endsWith("/valuation/agent-quoting")) return { status: 200, body: { data: null, available: false, reason: "not_listed", message: "Not listed" } };
      if (path.endsWith("/street/profile")) return { status: 404, body: { detail: "no street row" } };
      if (path.endsWith("/sale-history")) return ok(Array.from({ length: 30 }, (_, i) => ({ date: `2020-01-${i}`, price: i, type: "Sold", address: "x" })));
      if (path.endsWith("/basics/all")) return ok({ bed_count: 2, bath_count: 1 });
      return { status: 500, body: {} };
    });
    const r = await getFacts("GANSW705970502", fetcher);
    expect(r.gnafId).toBe("GANSW705970502");
    expect(Object.keys(r.facts).sort()).toEqual(["agentQuoting", "avm", "basics", "risks", "saleHistory", "strataLevy", "streetProfile"]);
    expect(JSON.stringify(r.facts.risks)).not.toMatch(/public.?housing/i);
    expect(JSON.stringify(r.facts.risks)).not.toMatch(/geojson/);
    expect(r.facts.risks.available).toBe(true);
    expect(r.facts.agentQuoting).toEqual({ available: false, data: null, reason: "Not listed" });
    expect(r.facts.streetProfile.available).toBe(false);
    expect(r.facts.streetProfile.reason).toBeTruthy();
    expect((r.facts.saleHistory.data as unknown[]).length).toBeLessThanOrEqual(10);
    expect(r.facts.strataLevy.data).toMatchObject({ median_levy_annual: 4200 });
    expect(calls.some((c) => c === "/v1/suburbs/Surry%20Hills/market/strata-levies")).toBe(true);
  });

  it("never throws when the fetcher throws; fact becomes unavailable", async () => {
    const r = await getFacts("GANSW1", async () => {
      throw new Error("boom");
    });
    expect(r.facts.avm).toMatchObject({ available: false, data: null });
  });

  it("mock upstream yields deterministic facts with no public housing", async () => {
    const a = await getFacts("GANSW900000001", mockUpstream);
    const b = await getFacts("GANSW900000001", mockUpstream);
    expect(a).toEqual(b);
    expect(a.facts.avm.available).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/public.?housing/i);
  });
});

describe("stripPublicHousing hardening", () => {
  it("handles social housing and type/category/description fields", () => {
    const out = stripPublicHousing({
      social_housing: 1,
      list: [
        { type: "Social Housing" },
        { category: "public-housing" },
        { description: "Public housing nearby" },
        { name: "Heritage" },
        { label: "social_housing" },
      ],
    });
    expect(out).toEqual({ list: [{ name: "Heritage" }] });
  });
});

describe("live response shapes", () => {
  it("maps no_data to buyer wording, drops undated/unpriced sale rows, keeps AVM confidence, strips public housing", async () => {
    const { getFacts } = await import("@/lib/facts");
    const r = await getFacts("GANSW716627274", async (path: string) => {
      if (path.endsWith("/valuation/agent-quoting")) return { status: 200, body: { data: null, available: false, reason: "no_data", message: "No agent-quoting data for GANSW716627274" } };
      if (path.endsWith("/valuation/avm")) return { status: 200, body: { data: { predicted_price: 1, predicted_price_low: 0.5, predicted_price_high: 2, prediction_date: "2026-07-27", confidence_score: 95 } } };
      if (path.endsWith("/sale-history")) return { status: 200, body: { data: [{ type: "For Sale", address: "902/417-419 Bourke Street" }] } };
      if (path.endsWith("/risks/all")) return { status: 200, body: { data: { flood: null, public_housing: [{ name: "Public Housing", value: "2.7%" }], heritage: [{ name: "Heritage", on_property: true, area_level: "Layer" }] } } };
      if (path.endsWith("/profile")) return { status: 200, body: { data: { suburb: "Waterloo (NSW)" } } };
      if (path.includes("/suburbs/Waterloo%20(NSW)/market/strata-levies")) return { status: 200, body: { data: { area_name: "Waterloo (NSW)", median_levy_annual: 6246, n_properties: 80 } } };
      return { status: 200, body: { data: null, available: false, reason: "no_data", message: "x" } };
    });
    expect(r.facts.agentQuoting.reason).toBe("Not listed with a tracked agency right now.");
    expect(r.facts.saleHistory).toEqual({ available: false, data: null, reason: "No recorded sales for this home." });
    expect((r.facts.avm.data as { confidence_score: number }).confidence_score).toBe(95);
    expect(r.facts.risks.data).toEqual({ flood: null, heritage: [{ name: "Heritage", on_property: true }] });
    expect(r.facts.strataLevy.available).toBe(true);
  });
});
