/**
 * Spoken 30-second inspection briefing: a short, plain-English script built from the facts.
 * Every number is spoken as words, rounded for the ear ("about one point one million").
 */
import { createHash } from "node:crypto";
import type { Fact } from "./facts";

export const MAX_WORDS = 75;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function num(o: unknown, keys: readonly string[]): number | null {
  if (!isObj(o)) return null;
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[$,%\s]/g, "")) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(o: unknown, keys: readonly string[]): string | null {
  if (!isObj(o)) return null;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return under100(r);
  return `${ONES[h]} hundred${r ? ` and ${under100(r)}` : ""}`;
}

/** Non-negative integers below a million, in British/Australian English. */
export function speakNumber(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000) return speakMoney(n).replace(/^about /, "");
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  if (!th) return under1000(r);
  return `${under1000(th)} thousand${r ? (r < 100 ? ` and ${under100(r)}` : ` ${under1000(r)}`) : ""}`;
}

/** Dollar amounts rounded for speech, without the word "dollars". */
export function speakMoney(value: number): string {
  if (value >= 1_000_000) {
    const m = Math.round(value / 50_000) * 0.05; // nearest $50k
    const whole = Math.floor(m + 1e-9);
    const dec = Math.round((m - whole) * 100);
    const digits = dec === 0 ? "" : dec % 10 === 0 ? ` point ${ONES[dec / 10]}` : ` point ${dec < 10 ? "oh" : ONES[Math.floor(dec / 10)]} ${ONES[dec % 10]}`;
    return `about ${speakNumber(whole)}${digits} million`;
  }
  const step = value >= 100_000 ? 10_000 : value >= 10_000 ? 1_000 : 100;
  return `about ${speakNumber(Math.round(value / step) * step)}`;
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

const factData = (f: Fact | undefined): unknown => (f?.available ? f.data : null);

function valueSentence(avm: unknown): string | null {
  const mid = num(avm, ["predicted_price", "value", "estimate"]);
  if (mid === null) return null;
  const lo = num(avm, ["predicted_price_low", "low"]);
  const hi = num(avm, ["predicted_price_high", "high"]);
  const range = lo !== null && hi !== null && hi > lo ? `, likely ${speakMoney(lo).replace(/^about /, "")} to ${speakMoney(hi).replace(/^about /, "")}` : "";
  return `Microburbs values this home at ${speakMoney(mid)}${range}.`;
}

/** Live data rarely has an AVM: fall back to the home's last sale, then to its street's typical price. */
function priceFallbackSentence(sales: unknown, street: unknown, basics: unknown): string | null {
  if (Array.isArray(sales)) {
    const sold = sales
      .filter((x) => isObj(x) && num(x, ["price"]) !== null && (!str(x, ["type"]) || /sold/i.test(str(x, ["type"])!)))
      .sort((a, b) => String(str(b, ["date"]) ?? "").localeCompare(String(str(a, ["date"]) ?? "")))[0];
    if (sold) {
      const year = (str(sold, ["date"]) ?? "").match(/^\d{4}/)?.[0];
      return `This home last sold for ${speakMoney(num(sold, ["price"])!)}${year ? ` in ${speakNumber(Number(year))}` : ""}.`;
    }
  }
  // The street price is house-led: don't read it out for an apartment.
  if (/unit|apartment|flat/i.test(str(basics, ["dwelling_type"]) ?? "")) return null;
  const price = isObj(street) ? num(street.profile, ["current_price"]) : null;
  if (price === null) return null;
  const name = str(street, ["street"]);
  return `Homes on ${name ?? "this street"} typically sell for ${speakMoney(price)}.`;
}

function agencySentence(q: unknown): string | null {
  const dev = num(q, ["median_deviation_pct", "avg_gap_pct"]);
  const rateRaw = num(q, ["underquote_rate_pct", "underquote_rate"]);
  const rate = rateRaw === null ? null : rateRaw > 1 ? rateRaw / 100 : rateRaw;
  if (dev === null && rate === null) return null;
  if ((dev !== null && dev >= 5) || (rate !== null && rate >= 0.4)) {
    const by = dev !== null && dev > 0 ? `about ${speakNumber(dev)} percent above the guide` : "above the guide";
    return `Careful: this agency usually sells ${by}, so treat the guide as a floor.`;
  }
  if (dev !== null && dev <= -5) return "This agency's guides tend to run above the final price.";
  return "This agency's guides are usually close to the final price.";
}

function riskSentence(risks: unknown): string | null {
  if (!isObj(risks)) return null;
  const items = Object.entries(risks).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => ({ k, x })));
  const hit = items.find(({ x }) => isObj(x) && x.on_property === true);
  if (hit) {
    const name = (isObj(hit.x) && typeof hit.x.name === "string" ? hit.x.name : hit.k.replace(/_/g, " ")).replace(/\d+/g, (d) => speakNumber(Number(d)));
    return `A ${name.toLowerCase()} overlay applies to this property; check it with the council.`;
  }
  return items.length ? "No risk overlays sit on the property itself." : null;
}

function strataSentence(levy: unknown, basics: unknown): string | null {
  const type = str(basics, ["dwelling_type", "property_type"]) ?? "";
  if (!/unit|apartment|flat|strata/i.test(type)) return null;
  const amount = num(levy, ["median_levy_annual", "levy_annual", "median_levy"]);
  return amount === null ? null : `Strata levies here run ${speakMoney(amount)} dollars a year.`;
}

/** Reads whatever shape the 3D context has; returns null when it says nothing usable. */
function riseSentence(ctx: unknown): string | null {
  if (!isObj(ctx) || ctx.available === false) return null;
  const tallest = ctx.tallestNeighbour;
  if (isObj(tallest)) {
    const storeys = num(tallest, ["storeys"]);
    const dir = str(tallest, ["direction"]);
    const where = dir && /^[a-z-]{4,12}$/.test(dir) ? `Nearby to the ${dir}` : "Nearby";
    if (storeys !== null && storeys > 0) return `${where}, planning allows up to about ${speakNumber(storeys)} storeys, which could change your light or view.`;
  }
  const summary = str(ctx, ["summary", "nextDoor", "next_door", "next_door_summary"]);
  if (summary && summary.length <= 160) return summary.replace(/\d+(\.\d+)?/g, (d) => speakNumber(Number(d))).replace(/([^.!?])$/, "$1.");
  const metres = num(ctx, ["next_door_max_height_m", "nextDoorMaxHeightM", "max_height_m", "maxHeightM", "height_limit_m", "heightLimitM"]);
  if (metres !== null && metres > 0) return `Next door, planning allows buildings up to about ${speakNumber(metres)} metres, which could change your light or view.`;
  const storeys = num(ctx, ["next_door_max_storeys", "max_storeys", "maxStoreys", "storeys"]);
  if (storeys !== null && storeys > 0) return `Next door, planning allows up to ${speakNumber(storeys)} storeys, which could change your light or view.`;
  return null;
}

/**
 * Builds a script of at most MAX_WORDS words. Sentences are admitted by priority
 * (value, agency, next door, risk, strata) and then spoken in a natural order.
 */
export function buildBriefingScript(facts: Partial<Record<string, Fact>>, context3d: unknown = null): string {
  const parts: Array<{ order: number; text: string | null }> = [
    { order: 0, text: valueSentence(factData(facts.avm)) ?? priceFallbackSentence(factData(facts.saleHistory), factData(facts.streetProfile), factData(facts.basics)) },
    { order: 1, text: agencySentence(factData(facts.agentQuoting)) },
    { order: 2, text: riseSentence(context3d ?? factData(facts.context3d)) },
    { order: 3, text: riskSentence(factData(facts.risks)) },
    { order: 4, text: strataSentence(factData(facts.strataLevy), factData(facts.basics)) },
  ];
  const chosen: Array<{ order: number; text: string }> = [];
  let words = 0;
  for (const p of parts) {
    if (!p.text) continue;
    const w = wordCount(p.text);
    if (words + w > MAX_WORDS) continue;
    chosen.push({ order: p.order, text: p.text });
    words += w;
  }
  if (!chosen.length) return "Groundtruth has not enough data on this home for a briefing yet. Check the panel for what is available.";
  return [...chosen].sort((a, b) => a.order - b.order).map((c) => c.text).join(" ");
}

/* ------------------------------------------------------------------ */
/* Human-sounding script via OpenAI, grounded in the same facts.       */
/* ------------------------------------------------------------------ */

const round = (n: number | null, step = 1): number | null => (n === null ? null : Number((Math.round(n / step) * step).toFixed(2)));

function riskNames(risks: unknown): string[] {
  if (!isObj(risks)) return [];
  return Object.entries(risks)
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => ({ k, x })))
    .filter(({ x }) => isObj(x) && x.on_property === true)
    .map(({ k, x }) => (isObj(x) && typeof x.name === "string" ? x.name : k.replace(/_/g, " ")));
}

function lastSold(sales: unknown): { price: number; year: number | null } | null {
  if (!Array.isArray(sales)) return null;
  const sold = sales
    .filter((x) => isObj(x) && num(x, ["price"]) !== null && (!str(x, ["type"]) || /sold/i.test(str(x, ["type"])!)))
    .sort((a, b) => String(str(b, ["date"]) ?? "").localeCompare(String(str(a, ["date"]) ?? "")))[0];
  if (!sold) return null;
  const year = (str(sold, ["date"]) ?? "").match(/^\d{4}/)?.[0];
  return { price: num(sold, ["price"])!, year: year ? Number(year) : null };
}

function nextDoor(ctx: unknown): Obj | null {
  if (!isObj(ctx) || ctx.available === false) return null;
  const t = isObj(ctx.tallestNeighbour) ? ctx.tallestNeighbour : null;
  const storeys = num(t, ["storeys"]) ?? num(ctx, ["next_door_max_storeys", "max_storeys", "maxStoreys", "storeys"]);
  const metres = num(ctx, ["next_door_max_height_m", "nextDoorMaxHeightM", "max_height_m", "maxHeightM", "height_limit_m", "heightLimitM"]);
  const direction = str(t, ["direction"]);
  if (storeys === null && metres === null) return null;
  return { planning_allows_storeys_nearby: storeys, planning_allows_height_m: metres, direction };
}

const dropNulls = (o: Obj): Obj =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && !(isObj(v) && !Object.keys(v).length)));

/** The grounded facts the LLM may use: the same sources as the template script, flattened and rounded. */
export function briefingFacts(facts: Partial<Record<string, Fact>>, context3d: unknown = null): Obj {
  const basics = factData(facts.basics);
  const avm = factData(facts.avm);
  const q = factData(facts.agentQuoting);
  const isUnit = /unit|apartment|flat|strata/i.test(str(basics, ["dwelling_type"]) ?? "");
  const rateRaw = num(q, ["underquote_rate_pct", "underquote_rate"]);
  const ratePct = rateRaw === null ? null : rateRaw <= 1 ? rateRaw * 100 : rateRaw;
  const total = num(q, ["total_sales"]);
  const street = factData(facts.streetProfile);
  const agency = isObj(q)
    ? dropNulls({
        name: str(q, ["agency_name"]),
        style: str(q, ["cohort"]),
        typical_sold_vs_guide_pct: round(num(q, ["median_deviation_pct", "avg_gap_pct"]), 0.1),
        recent_sales_tracked: total,
        recent_sales_above_guide: ratePct !== null && total !== null ? Math.round((ratePct / 100) * total) : null,
        likely_sale_price_for_this_home: round(num(q, ["likely_sale_price"]), 1000),
        advertised_guide: num(q, ["asking_price"]),
      })
    : null;
  return dropNulls({
    dwelling_type: str(basics, ["dwelling_type"]),
    bedrooms: num(basics, ["bed_count"]),
    bathrooms: num(basics, ["bath_count"]),
    car_spaces: num(basics, ["parking_count"]),
    microburbs_estimate: isObj(avm)
      ? dropNulls({ price: round(num(avm, ["predicted_price"]), 1000), low: round(num(avm, ["predicted_price_low"]), 1000), high: round(num(avm, ["predicted_price_high"]), 1000) })
      : null,
    last_sold: lastSold(factData(facts.saleHistory)),
    street_typical_price: !isUnit && isObj(street) ? round(num(street.profile, ["current_price"]), 1000) : null,
    street_name: isObj(street) ? str(street, ["street"]) : null,
    agency,
    risk_overlays_on_property: riskNames(factData(facts.risks)),
    strata_levy_per_year: isUnit ? round(num(factData(facts.strataLevy), ["median_levy_annual", "levy_annual", "median_levy"]), 10) : null,
    next_door: nextDoor(context3d ?? factData(facts.context3d)),
  });
}

export const LLM_MODEL = "gpt-4.1-mini";
const LLM_TIMEOUT_MS = 6_000;
const LLM_MAX_WORDS = 85;

export const SYSTEM_PROMPT = [
  "You are a friendly, plain-spoken Sydney buyer's advocate recording a 30-second voice note for a friend about to inspect this home.",
  "Use ONLY the facts provided; never invent numbers, names or claims. If a fact is missing, don't mention it.",
  "Round numbers for speech and write them as digits (for example $830,000, $1.1 million, 4%, 7 of 10).",
  "At most 75 words. Warm, conversational, a little personality, contractions. No bullet points, no markdown, no greetings like 'Hey there'.",
  "End with one practical tip for the inspection. Don't give financial advice; describe the facts.",
].join(" ");

/** Every number in the facts (including digits inside strings such as dates). */
function factNumbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) out.push(Number(m));
  else if (Array.isArray(v)) v.forEach((x) => factNumbers(x, out));
  else if (isObj(v)) Object.values(v).forEach((x) => factNumbers(x, out));
  return out;
}

/** Numbers as the reply states them: "$1.1 million" → 1100000, "830k" → 830000, "4%" → 4. */
export function replyNumbers(text: string): number[] {
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(million|mil|m\b|k\b|thousand)?/gi;
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    out.push(base * (unit.startsWith("m") ? 1_000_000 : unit ? 1_000 : 1));
  }
  return out;
}

/** True when every number in the reply matches a fact after rounding (≤5% or ≤0.5 off). */
export function numbersGrounded(reply: string, facts: unknown): boolean {
  const known = factNumbers(facts);
  return replyNumbers(reply).every((r) => known.some((k) => Math.abs(r - k) <= Math.max(0.5, Math.abs(k) * 0.05)));
}

export function cleanReply(text: string): string {
  let s = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (wordCount(s) > LLM_MAX_WORDS) {
    const words = s.split(" ").slice(0, LLM_MAX_WORDS).join(" ");
    const cut = words.lastIndexOf(".");
    s = cut > 40 ? words.slice(0, cut + 1) : `${words}.`;
  }
  return s;
}

export interface LlmOptions {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

/** One OpenAI call; null on any failure. Never logs the key. */
async function askOpenAI(factsJson: string, opts: Required<Pick<LlmOptions, "apiKey">> & LlmOptions): Promise<string | null> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await f("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.7,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: factsJson },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[groundtruth] briefing llm status", res.status);
      return null;
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = body.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content : null;
  } catch (e) {
    console.error("[groundtruth] briefing llm failed", e instanceof Error ? e.name : "error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const llmCache: Map<string, string> = ((globalThis as { __gtLlmCache?: Map<string, string> }).__gtLlmCache ??= new Map());
const LLM_CACHE_MAX = 128;

/**
 * The spoken script: an OpenAI rewrite of the grounded facts when OPENAI_API_KEY is set and the reply passes
 * validation (every number traceable to a fact), otherwise the deterministic template.
 */
export async function composeBriefing(
  gnafId: string,
  facts: Partial<Record<string, Fact>>,
  context3d: unknown = null,
  opts: LlmOptions = {},
): Promise<{ script: string; source: "llm" | "template" }> {
  const template = buildBriefingScript(facts, context3d);
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  const grounded = briefingFacts(facts, context3d);
  if (!apiKey || !Object.keys(grounded).length) return { script: template, source: "template" };
  const factsJson = JSON.stringify(grounded);
  const key = `${gnafId}:${createHash("sha256").update(factsJson).digest("hex").slice(0, 16)}`;
  const hit = llmCache.get(key);
  if (hit) return { script: hit, source: "llm" };
  const raw = await askOpenAI(factsJson, { ...opts, apiKey });
  const reply = raw ? cleanReply(raw) : "";
  if (!reply || wordCount(reply) < 12 || !numbersGrounded(reply, grounded)) {
    if (raw) console.error("[groundtruth] briefing llm reply rejected; using template");
    return { script: template, source: "template" };
  }
  llmCache.set(key, reply);
  while (llmCache.size > LLM_CACHE_MAX) llmCache.delete(llmCache.keys().next().value!);
  return { script: reply, source: "llm" };
}
