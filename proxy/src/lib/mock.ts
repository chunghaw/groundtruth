/**
 * Deterministic fake Microburbs API for MOCK=1 / no key. Same paths, same envelopes.
 *
 * Geocode rules (so the extension lane can exercise every resolver state):
 *  - query containing "NOMATCH"           -> no candidates          (NO_MATCH)
 *  - street containing "Twin"              -> two records, same address (CHOOSE)
 *  - unit given ("4/10 Crown St, ...")     -> that unit + 2 siblings (EXACT)
 *  - no unit, odd street number            -> units 1..4 only        (BUILDING)
 *  - no unit, even street number           -> one house              (EXACT)
 *  - suburb outside City of Sydney is caught before any call         (OUT_OF_AREA)
 */
import { parseAddress, titleCase } from "./normalise";
import { FALLBACK_AREA_SUBURBS } from "./area";
import type { Upstream } from "./microburbs";
import { mock3dUpstream } from "./mock3d";

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mockGnaf(label: string): string {
  return `GANSW9${String(hash(label.toUpperCase()) % 1e8).padStart(8, "0")}`;
}

const ok = (data: unknown): Upstream => ({ status: 200, body: { data } });
const none = (reason: string, message: string): Upstream => ({ status: 200, body: { data: null, available: false, reason, message } });

function geocodeMock(q: string): Upstream {
  if (/NOMATCH/i.test(q)) return ok([]);
  const a = parseAddress(q);
  if (!a.number || !a.streetDisplay) return ok([]);
  const street = titleCase(a.streetDisplay);
  const suburb = titleCase(a.suburbDisplay ?? "Sydney");
  const mk = (unit: string | null, number: string) => {
    const display = `${unit ? `${unit}/` : ""}${number} ${street}, ${suburb}`;
    return { id: mockGnaf(display), name: display, display_name: display, abbr: display.toUpperCase().replace(",", ""), property_type: unit ? "unit" : "house" };
  };
  if (/\bTWIN\b/i.test(street)) {
    const one = mk(a.unit, a.number);
    return ok([one, { ...one, id: mockGnaf(`${one.display_name}#2`) }]);
  }
  if (a.unit) {
    const n = Number(a.unit);
    const sib = Number.isFinite(n) ? [String(n + 1), String(n + 2)] : [`${a.unit}A`, `${a.unit}B`];
    return ok([mk(a.unit, a.number), ...sib.map((u) => mk(u, a.number!))]);
  }
  const first = parseInt(a.number, 10);
  if (first % 2 === 1) return ok(["1", "2", "3", "4"].map((u) => mk(u, a.number!)));
  return ok([mk(null, a.number)]);
}

function propertyMock(gnaf: string, what: string): Upstream {
  const s = hash(gnaf);
  const price = 650_000 + (s % 30) * 50_000;
  switch (what) {
    case "valuation/avm":
      return ok({ predicted_price: price, predicted_price_low: Math.round(price * 0.88), predicted_price_high: Math.round(price * 1.12), prediction_date: "2026-10-01" });
    case "valuation/agent-quoting":
      if (s % 3 === 0) return none("not_listed", "This property isn't currently listed with a tracked agency.");
      return ok({ agency_name: "Mock Realty Surry Hills", asking_price: price - 50_000, cohort: s % 2 ? "Underquoter" : "Accurate", likely_sale_price: price, median_deviation_pct: 6.5, underquote_rate_pct: 40, total_sales: 12, recent_sales: [{ address: "1 Mock Street, Surry Hills", guide_price: 900000, sold_price: 960000, sold_date: "2026-08-02", diff_pct: 6.7 }] });
    case "sale-history":
      return ok([{ date: "2021-03-14", price: Math.round(price * 0.8), type: "Sold" }, { date: "2016-07-02", price: Math.round(price * 0.62), type: "Sold" }]);
    case "street/profile":
      if (s % 5 === 0) return { status: 404, body: { detail: "No street forecast row for this street." } };
      return ok({ street: "Mock St", suburb: "Surry Hills", profile: { title: "Mock Street", current_price: price, annual_4y: 5.1, past_growth_pct: 3.2, confidence: "Medium", sale_turnover: "Every 9 years", renters_pct: "45%", houses_on_street: 12, units_on_street: 80, n_sales: 40 }, suburb_medians: { annual_4y: 4.8, past_growth_pct: 3.0, renters_pct: 50 }, forecast_rank: { rank: 12, total: 81, band: "Top 15%" } });
    case "risks/all":
      return ok({
        flood: [{ name: "Flood", on_property: false, nearest_distance_m: 257, features_within_radius: 3, search_radius_m: 1000, value: "Not on property; nearest 257 m away" }],
        heritage: [{ name: "Heritage", on_property: s % 4 === 0, nearest_distance_m: s % 4 === 0 ? 0 : 120, features_within_radius: 8, search_radius_m: 1000, value: s % 4 === 0 ? "On property" : "Not on property; nearest 120 m away" }],
        public_housing: [{ name: "Public Housing", on_property: false, value: "3.4%" }],
      });
    case "basics/all":
      return ok({ bed_count: 1 + (s % 3), bath_count: 1 + (s % 2), parking_count: s % 2, dwelling_type: "unit", land_area_sqm: null });
    case "profile":
      return ok({ suburb: "Surry Hills", postcode: "2010", lga: "Sydney", state: "NSW" });
    default:
      return { status: 404, body: { detail: "mock: unknown path" } };
  }
}

export async function mockUpstream(pathAndQuery: string): Promise<Upstream> {
  const url = new URL(pathAndQuery, "http://mock");
  const p = url.pathname;
  const ctx3d = mock3dUpstream(p);
  if (ctx3d) return ctx3d;
  if (p === "/v1/geocode/address") return geocodeMock(url.searchParams.get("address") ?? "");
  if (p === "/v1/suburbs/list") return ok(FALLBACK_AREA_SUBURBS.map((suburb) => ({ suburb, state: "NSW" })));
  const strata = p.match(/^\/v1\/suburbs\/([^/]+)\/market\/strata-levies$/);
  if (strata) return ok({ area_level: "suburb", area_name: decodeURIComponent(strata[1]), median_levy_annual: 4120.5, n_properties: 812 });
  const prop = p.match(/^\/v1\/properties\/([^/]+)\/(.+)$/);
  if (prop) return propertyMock(decodeURIComponent(prop[1]), prop[2]);
  return { status: 404, body: { detail: "mock: unknown path" } };
}
