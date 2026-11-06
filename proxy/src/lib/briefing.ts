/**
 * Spoken 30-second inspection briefing: a short, plain-English script built from the facts.
 * Every number is spoken as words, rounded for the ear ("about one point one million").
 */
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
    return `A ${name} overlay applies to this property; check it with the council.`;
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
    { order: 0, text: valueSentence(factData(facts.avm)) },
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
