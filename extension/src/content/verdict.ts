import type { FactsResponse } from '../api-types';
import { h } from './dom';
import { money, parseGuidePrice, pct, pickNumber, pickString } from './format';
import type { HeadroomInsight } from '../context3d/types';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export interface Verdict {
  readonly kicker: string;
  /** Headline split so the key figure can be emphasised: [before, emphasis, after]. */
  readonly headline: readonly [string, string, string];
  readonly sub: string | null;
  readonly tone: Tone;
}

const UNDERQUOTE_ALERT = 0.4;

/** "3.9" from 3.9, "12" from 12.4: one decimal under 10, whole numbers above. */
export function fmtPct(n: number): string {
  const a = Math.abs(n);
  return a.toFixed(a < 10 ? 1 : 0).replace(/\.0$/, '');
}

/** Underquote rate as a 0-1 fraction, or null. */
export function underquoteRate(d: unknown): number | null {
  const raw = pickNumber(d, ['underquote_rate_pct', 'underquote_rate', 'underquoting_rate', 'pct_underquoted']);
  return raw === null ? null : raw > 1 ? raw / 100 : raw;
}

/** "7 of 10 of this agency’s recent sales sold above their guide", or null when the count or rate is missing. */
export function salesAboveGuide(d: unknown): string | null {
  const rate = underquoteRate(d);
  const n = pickNumber(d, ['total_sales', 'n_sales', 'sample_size']);
  if (rate === null || n === null || n < 1 || rate < 0 || rate > 1) return null;
  const total = Math.round(n);
  const above = Math.min(total, Math.round(rate * total));
  return `${above} of ${total} of this agency’s recent sale${total === 1 ? '' : 's'} sold above their guide`;
}

export interface PriceEstimate {
  readonly price: number;
  readonly label: string;
  readonly range: { readonly low: number; readonly high: number } | null;
  /** The working behind the number, e.g. "This home's guide $800k + this agency's typical +3.9% (median of 10 sales)". */
  readonly working?: string;
}

/** "This home’s guide $800k + this agency’s typical +3.9% (median of 10 sales)"; null without this home's asking price. */
export function priceWorking(q: unknown): string | null {
  const ask = pickNumber(q, ['asking_price']);
  const dev = pickNumber(q, ['median_deviation_pct', 'avg_gap_pct']);
  if (ask === null || ask <= 0 || dev === null) return null;
  const n = pickNumber(q, ['total_sales', 'n_sales', 'sample_size']);
  const sign = dev >= 0 ? '+' : '−';
  const median = n !== null && n > 0 ? ` (median of ${Math.round(n)} sale${Math.round(n) === 1 ? '' : 's'})` : '';
  return `This home’s guide ${money(ask)} + this agency’s typical ${sign}${fmtPct(dev)}%${median}`;
}

/** Headline price: agency likely sale price → Microburbs AVM → buyer's guide × (1 + agency median deviation). */
export function priceEstimate(facts: FactsResponse | null, guideInput = ''): PriceEstimate | null {
  const aq = facts?.facts.agentQuoting;
  const q = aq?.available ? aq.data : null;
  const likely = pickNumber(q, ['likely_sale_price']);
  if (likely !== null && likely > 0) {
    const working = priceWorking(q);
    return { price: likely, label: 'Based on this agency’s guide-vs-sold record', range: null, ...(working ? { working } : {}) };
  }
  const avm = facts?.facts.avm;
  const a = avm?.available ? avm.data : null;
  const mid = pickNumber(a, ['predicted_price', 'value', 'estimate', 'mid']);
  if (mid !== null && mid > 0) {
    const low = pickNumber(a, ['predicted_price_low', 'low', 'lower']);
    const high = pickNumber(a, ['predicted_price_high', 'high', 'upper']);
    return { price: mid, label: 'Microburbs estimate', range: low !== null && high !== null && high > low ? { low, high } : null };
  }
  const guide = parseGuidePrice(guideInput);
  const dev = pickNumber(q, ['median_deviation_pct', 'avg_gap_pct']);
  if (guide !== null && dev !== null) {
    return { price: Math.round(guide * (1 + dev / 100)), label: `Your guide adjusted by this agency’s typical ${dev >= 0 ? '+' : '−'}${fmtPct(dev)}%`, range: null };
  }
  return null;
}

export function priceBlockEl(p: PriceEstimate): HTMLElement {
  return h('div', { class: 'price-block', role: 'status' },
    h('p', { class: 'kicker' }, 'Estimated price'),
    h('p', { class: 'price' }, 'Likely to sell for about ', h('b', {}, money(p.price))),
    p.working ? h('p', { class: 'psub working' }, p.working) : null,
    h('p', { class: 'psub' }, p.range ? `${p.label} · 80% range ${money(p.range.low)}–${money(p.range.high)}` : p.label));
}

/** Verdict from the agency's guide-vs-sold record; null when there is none (most live homes). */
export function quotingVerdict(facts: FactsResponse | null): Verdict | null {
  const aq = facts?.facts.agentQuoting;
  const d = aq?.available ? aq.data : null;
  const agency = pickString(d, ['agency_name', 'agency']);
  const n = pickNumber(d, ['total_sales', 'n_sales', 'sample_size']);
  const dev = pickNumber(d, ['median_deviation_pct', 'avg_gap_pct']);
  const rate = underquoteRate(d);
  const above = salesAboveGuide(d);
  const who = [above ?? (n !== null ? `${n} tracked sales` : null), agency].filter(Boolean).join(' · ') || null;
  if (dev !== null && Math.abs(dev) >= 0.5) {
    const over = dev > 0;
    return {
      kicker: 'Price guide check',
      headline: ['Agency usually sells ', `${fmtPct(dev)}% ${over ? 'over' : 'under'}`, ' guide'],
      sub: who,
      tone: over && (dev >= 5 || (rate ?? 0) >= UNDERQUOTE_ALERT) ? 'warn' : 'ok',
    };
  }
  if (rate !== null) {
    const head: [string, string, string] = above ? ['', above.replace(/ sold above their guide$/, ''), ' sold above their guide'] : ['', pct(rate), ' of this agency’s sales sold above the guide'];
    return { kicker: 'Price guide check', headline: head, sub: agency, tone: rate >= UNDERQUOTE_ALERT ? 'warn' : 'ok' };
  }
  return null;
}

/** "2 lots within 100 m could rise 4–5 more storeys", when the 3D view found real headroom. */
export function headroomVerdict(i: HeadroomInsight | null | undefined): Verdict | null {
  if (!i || !i.known || i.count < 1 || !i.biggest || i.maxStoreys < 2) return null;
  const range = i.count > 1 && i.minStoreys !== i.maxStoreys ? `${i.minStoreys}–${i.maxStoreys}` : `${i.maxStoreys}`;
  const b = i.biggest;
  return {
    kicker: 'What can rise next door',
    headline: ['', `${i.count} lot${i.count === 1 ? '' : 's'} within ${i.nearM} m`, ` could rise ${range} more storeys`],
    sub: `Biggest: ${b.distanceM} m ${b.direction}, +${b.storeys} storeys under today’s planning controls.`,
    tone: 'warn',
  };
}

/**
 * The one line a buyer should read first. Chain: agency quoting → 3D headroom → AVM → last sale →
 * street vs suburb → neutral. `insight` is the 3D map's headroom finding, once it has arrived.
 */
export function factsVerdict(facts: FactsResponse | null, insight?: HeadroomInsight | null): Verdict {
  const q = quotingVerdict(facts);
  if (q) return q;
  const hr = headroomVerdict(insight);
  if (hr) return hr;
  const avm = facts?.facts.avm;
  const mid = avm?.available ? pickNumber(avm.data, ['predicted_price', 'value', 'estimate', 'mid']) : null;
  if (mid !== null) return { kicker: 'Independent value', headline: ['Microburbs values this home at ', money(mid), ''], sub: 'Automated estimate, not an agent’s guide.', tone: 'info' };
  // Live data: agent quoting needs an active tracked listing and the AVM covers few homes, so fall
  // back to this home's own last sale, then to the street's typical price.
  const sold = lastSale(facts);
  if (sold) return { kicker: 'Sale record', headline: ['This home last sold for ', money(sold.price), ''], sub: sold.date ? `Recorded ${sold.date}` : null, tone: 'info' };
  const sp = facts?.facts.streetProfile;
  const street = sp?.available ? (sp.data as { profile?: unknown; street?: unknown } | null) : null;
  const bs = facts?.facts.basics;
  const isUnit = /unit|apartment|flat/i.test(pickString(bs?.available ? bs.data : null, ['dwelling_type']) ?? '');
  const typical = isUnit ? null : pickNumber(street?.profile, ['current_price']);
  if (typical !== null) {
    const name = pickString(street, ['street']) ?? 'this street';
    const nSales = pickNumber(street?.profile, ['n_sales']);
    return { kicker: 'Street check', headline: [`Homes on ${name} typically sell for `, money(typical), ''], sub: nSales !== null ? `Microburbs street estimate · ${nSales} sales` : 'Microburbs street estimate', tone: 'info' };
  }
  const sg = pickNumber(street?.profile, ['annual_4y']);
  const sub = pickNumber((street as { suburb_medians?: unknown } | null)?.suburb_medians, ['annual_4y']);
  if (sg !== null && sub !== null) {
    const name = pickString(street, ['street']) ?? pickString(street?.profile, ['title']) ?? 'this street';
    return { kicker: 'Street vs suburb', headline: [`${name} is forecast to grow `, `${sg}% a year`, `, vs ${sub}% for the suburb`], sub: 'Microburbs street profile', tone: 'info' };
  }
  return { kicker: 'Verified home', headline: ['Verified home, ', 'here’s what we know', ''], sub: null, tone: 'neutral' };
}

function lastSale(facts: FactsResponse | null): { price: number; date: string | null } | null {
  const sh = facts?.facts.saleHistory;
  if (!sh?.available || !Array.isArray(sh.data)) return null;
  const rows = (sh.data as unknown[])
    .map((x) => ({ price: pickNumber(x, ['price', 'sold_price']), date: pickString(x, ['date', 'sold_date']), type: pickString(x, ['type']) }))
    .filter((x): x is { price: number; date: string | null; type: string | null } => x.price !== null && (!x.type || /sold/i.test(x.type)))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return rows[0] ? { price: rows[0].price, date: rows[0].date } : null;
}

export function verdictEl(v: Verdict, cta?: HTMLElement | null): HTMLElement {
  return h('div', { class: `verdict ${v.tone}`, role: 'status' },
    h('p', { class: 'kicker' }, v.kicker),
    h('h2', {}, v.headline[0], v.headline[1] ? h('em', {}, v.headline[1]) : null, v.headline[2]),
    v.sub ? h('p', { class: 'vsub' }, v.sub) : null,
    cta ?? null);
}
