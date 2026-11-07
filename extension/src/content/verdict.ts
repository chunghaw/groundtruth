import type { FactsResponse } from '../api-types';
import { h } from './dom';
import { money, pct, pickNumber, pickString } from './format';
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

/** Verdict from the agency's guide-vs-sold record; null when there is none (most live homes). */
export function quotingVerdict(facts: FactsResponse | null): Verdict | null {
  const aq = facts?.facts.agentQuoting;
  const d = aq?.available ? aq.data : null;
  const agency = pickString(d, ['agency_name', 'agency']);
  const n = pickNumber(d, ['total_sales', 'n_sales', 'sample_size']);
  const dev = pickNumber(d, ['median_deviation_pct', 'avg_gap_pct']);
  const rateRaw = pickNumber(d, ['underquote_rate_pct', 'underquote_rate', 'underquoting_rate', 'pct_underquoted']);
  const rate = rateRaw === null ? null : rateRaw > 1 ? rateRaw / 100 : rateRaw;
  const who = [agency, n !== null ? `${n} tracked sales` : null].filter(Boolean).join(' · ') || null;
  if (dev !== null && Math.abs(dev) >= 0.5) {
    const over = dev > 0;
    return {
      kicker: 'Price guide check',
      headline: ['Agency usually sells ', `${Math.abs(dev).toFixed(Math.abs(dev) < 10 ? 1 : 0).replace(/\.0$/, '')}% ${over ? 'over' : 'under'}`, ' guide'],
      sub: who,
      tone: over && (dev >= 5 || (rate ?? 0) >= UNDERQUOTE_ALERT) ? 'warn' : 'ok',
    };
  }
  if (rate !== null) {
    return { kicker: 'Price guide check', headline: ['', pct(rate), ' of this agency’s sales beat the guide'], sub: who, tone: rate >= UNDERQUOTE_ALERT ? 'warn' : 'ok' };
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
