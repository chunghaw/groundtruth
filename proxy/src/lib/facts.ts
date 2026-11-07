import type { Upstream } from "./microburbs";

export type FactsFetcher = (pathAndQuery: string) => Promise<Upstream>;

export interface Fact {
  available: boolean;
  data: unknown | null;
  reason?: string;
}

export type FactName = "agentQuoting" | "avm" | "saleHistory" | "streetProfile" | "risks" | "strataLevy" | "basics";

export interface FactsResponse {
  gnafId: string;
  facts: Record<FactName, Fact>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const PUBLIC_HOUSING = /(public|social)[\s_-]?housing/i;

/** Removes every public-housing key, and any list item named/labelled public housing, at any depth. */
export function stripPublicHousing(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v
      .filter((item) => !(isObj(item) && [item.name, item.label, item.title, item.type, item.category, item.description].some((x) => typeof x === "string" && PUBLIC_HOUSING.test(x))))
      .map(stripPublicHousing);
  }
  if (isObj(v)) {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !PUBLIC_HOUSING.test(k)).map(([k, x]) => [k, stripPublicHousing(x)]));
  }
  return v;
}

function pick(o: unknown, keys: readonly string[]): Obj | null {
  if (!isObj(o)) return null;
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
}

const RISK_ITEM_KEYS = ["name", "on_property", "nearest_distance_m", "features_within_radius", "search_radius_m", "value", "value_unit"] as const;

const TRIM: Record<Exclude<FactName, "strataLevy">, (d: unknown) => unknown> = {
  agentQuoting: (d) => {
    const o = pick(d, ["agency_name", "asking_price", "cohort", "likely_sale_price", "median_deviation_pct", "underquote_rate_pct", "total_sales", "recent_sales"]);
    if (o && Array.isArray(o.recent_sales)) return { ...o, recent_sales: o.recent_sales.slice(0, 5) };
    return o;
  },
  avm: (d) => pick(d, ["predicted_price", "predicted_price_low", "predicted_price_high", "prediction_date", "confidence_score"]),
  // Live rows carry `address`; an open listing can appear as { type: "For Sale" } with no date or price.
  saleHistory: (d) =>
    Array.isArray(d) ? d.map((x) => pick(x, ["date", "price", "type"])).filter((x): x is Obj => !!x && (typeof x.price === "number" || typeof x.date === "string")).slice(0, 10) : null,
  streetProfile: (d) => {
    if (!isObj(d)) return null;
    return {
      street: d.street ?? null,
      suburb: d.suburb ?? null,
      profile: pick(d.profile, ["title", "current_price", "n_sales", "annual_2y", "annual_4y", "annual_8y", "past_growth_pct", "confidence", "sale_turnover", "sale_turnover_years", "renters_pct", "renters_pct_num", "houses_on_street", "units_on_street", "median_house_rent_week"]),
      suburb_medians: isObj(d.suburb_medians) ? d.suburb_medians : null,
      forecast_rank: isObj(d.forecast_rank) ? d.forecast_rank : null,
    };
  },
  risks: (d) => {
    const clean = stripPublicHousing(d);
    if (!isObj(clean)) return null;
    return Object.fromEntries(
      Object.entries(clean).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => pick(x, RISK_ITEM_KEYS)) : v]).filter(([k]) => !/geojson/i.test(String(k))),
    );
  },
  basics: (d) => pick(d, ["bed_count", "bath_count", "parking_count", "dwelling_type", "land_area_sqm"]),
};

function unavailable(reason: string): Fact {
  return { available: false, data: null, reason };
}

/**
 * Buyer-facing wording for the live API's `{ data: null, available: false, reason: "no_data", message }`.
 * Agent quoting only exists while a home is listed with a tracked agency, so it is usually absent.
 */
const NO_DATA: Partial<Record<FactName, string>> = {
  agentQuoting: "Not listed with a tracked agency right now.",
  avm: "No automated valuation for this home.",
  saleHistory: "No recorded sales for this home.",
  streetProfile: "No street profile for this street.",
  strataLevy: "No strata levy data for this suburb.",
};

function toFact(u: Upstream, trim: (d: unknown) => unknown, name?: FactName): Fact {
  const body = (isObj(u.body) ? u.body : {}) as Obj;
  if (u.status === 200) {
    if (body.data == null) {
      const fallback = typeof body.message === "string" ? body.message : typeof body.reason === "string" ? body.reason : "No data for this property.";
      return unavailable((name && body.reason === "no_data" && NO_DATA[name]) || fallback);
    }
    const data = trim(body.data);
    if (Array.isArray(data) && data.length === 0) return unavailable((name && NO_DATA[name]) || "No data for this property.");
    return data == null ? unavailable("Unexpected data shape.") : { available: true, data };
  }
  if (u.status === 403) return unavailable("Outside the City of Sydney coverage area.");
  if (u.status === 404) return unavailable(typeof body.detail === "string" ? body.detail : "No data for this property.");
  if (u.status === 429) return unavailable("Rate limited; try again shortly.");
  return unavailable(`Data source error (${u.status}).`);
}

async function safe(fetcher: FactsFetcher, path: string): Promise<Upstream> {
  try {
    return await fetcher(path);
  } catch (e) {
    console.error("[groundtruth] fact fetch failed", path, e instanceof Error ? e.message : e);
    return { status: 599, body: {} };
  }
}

const PATHS: Record<Exclude<FactName, "strataLevy">, string> = {
  agentQuoting: "valuation/agent-quoting",
  avm: "valuation/avm",
  saleHistory: "sale-history",
  streetProfile: "street/profile",
  risks: "risks/all",
  basics: "basics/all",
};

/** All facts in parallel (the fetcher paces). strataLevy waits only on /profile for the SAL name. */
export async function getFacts(gnafId: string, fetcher: FactsFetcher): Promise<FactsResponse> {
  const base = `/v1/properties/${encodeURIComponent(gnafId)}`;
  const names = Object.keys(PATHS) as Array<keyof typeof PATHS>;
  const strata = (async (): Promise<Fact> => {
    const profile = await safe(fetcher, `${base}/profile`);
    const suburb = isObj(profile.body) && isObj(profile.body.data) ? profile.body.data.suburb : null;
    if (typeof suburb !== "string" || !suburb) return unavailable("Couldn't determine the suburb.");
    const r = await safe(fetcher, `/v1/suburbs/${encodeURIComponent(suburb)}/market/strata-levies`);
    return toFact(r, (d) => pick(d, ["area_name", "median_levy_annual", "n_properties"]), "strataLevy");
  })();
  const results = await Promise.all(names.map(async (n) => [n, toFact(await safe(fetcher, `${base}/${PATHS[n]}`), TRIM[n], n)] as const));
  const facts = { ...Object.fromEntries(results), strataLevy: await strata } as Record<FactName, Fact>;
  return { gnafId, facts };
}
