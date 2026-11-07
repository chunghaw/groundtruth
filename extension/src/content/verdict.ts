import type { FactsResponse } from '../api-types';
import { h } from './dom';
import { money, pct, pickNumber, pickString } from './format';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export interface Verdict {
  readonly kicker: string;
  /** Headline split so the key figure can be emphasised: [before, emphasis, after]. */
  readonly headline: readonly [string, string, string];
  readonly sub: string | null;
  readonly tone: Tone;
}

const UNDERQUOTE_ALERT = 0.4;

/** The one line a buyer should read first, derived from the facts we already have. */
export function factsVerdict(facts: FactsResponse | null): Verdict {
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
  const avm = facts?.facts.avm;
  const mid = avm?.available ? pickNumber(avm.data, ['predicted_price', 'value', 'estimate', 'mid']) : null;
  if (mid !== null) return { kicker: 'Independent value', headline: ['Microburbs values this home at ', money(mid), ''], sub: 'Automated estimate, not an agent’s guide.', tone: 'info' };
  return { kicker: 'Verified home', headline: ['Independent facts for ', 'this exact home', ''], sub: null, tone: 'neutral' };
}

export function verdictEl(v: Verdict, cta?: HTMLElement | null): HTMLElement {
  return h('div', { class: `verdict ${v.tone}`, role: 'status' },
    h('p', { class: 'kicker' }, v.kicker),
    h('h2', {}, v.headline[0], v.headline[1] ? h('em', {}, v.headline[1]) : null, v.headline[2]),
    v.sub ? h('p', { class: 'vsub' }, v.sub) : null,
    cta ?? null);
}
