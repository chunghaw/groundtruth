import type { Fact, FactsResponse } from '../api-types';
import { h } from './dom';
import { compareGuide, money, parseGuidePrice, pct, pickNumber, pickString, type AvmRange } from './format';

const UNDERQUOTE_ALERT = 0.4; // 40%+ of the agency's recent sales went above guide

const humanKey = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

function scalarRows(data: unknown, limit = 6): HTMLElement | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rows = Object.entries(data as Record<string, unknown>)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .slice(0, limit)
    .map(([k, v]) => h('tr', {}, h('td', {}, humanKey(k)), h('td', {}, typeof v === 'number' && v > 10_000 ? money(v) : String(v))));
  return rows.length ? h('table', { class: 'mini' }, ...rows) : null;
}

function card(title: string, fact: Fact | undefined, body: (data: any) => HTMLElement[] | null, extraClass = ''): HTMLElement {
  if (!fact || !fact.available || fact.data === null || fact.data === undefined) {
    return h('section', { class: 'card na', 'aria-label': title },
      h('h3', {}, title), h('div', { class: 'big' }, fact?.reason ? `Not available: ${fact.reason}` : 'Not available for this home'));
  }
  let content: HTMLElement[] | null = null;
  try { content = body(fact.data); } catch { content = null; }
  const fallback = scalarRows(fact.data);
  return h('section', { class: `card ${extraClass}`.trim(), 'aria-label': title }, h('h3', {}, title),
    ...(content ?? (fallback ? [fallback] : [h('div', { class: 'sub' }, 'Data received, nothing to summarise.')])));
}

export function agentQuotingCard(fact: Fact | undefined): HTMLElement {
  const d = fact?.data;
  const rate = pickNumber(d, ['underquote_rate_pct', 'underquote_rate', 'underquoting_rate', 'pct_underquoted']);
  const r = rate === null ? null : rate > 1 ? rate / 100 : rate;
  const cohort = pickString(d, ['cohort']);
  const alert = (r !== null && r >= UNDERQUOTE_ALERT) || /underquot/i.test(cohort ?? '');
  return card('Agency quoting accuracy', fact, (data) => {
    if (r === null && !cohort) return null;
    const agency = pickString(data, ['agency_name', 'agency']);
    const dev = pickNumber(data, ['median_deviation_pct', 'avg_gap_pct']);
    const n = pickNumber(data, ['total_sales', 'n_sales', 'sample_size']);
    const likely = pickNumber(data, ['likely_sale_price']);
    const recent = Array.isArray(data?.recent_sales) ? data.recent_sales.slice(0, 3) : [];
    return [
      h('div', { class: 'big' }, r !== null ? `${pct(r)} of sales beat the guide` : cohort ?? ''),
      h('div', { class: 'sub' }, [agency, cohort, n !== null ? `${n} tracked sales` : null, dev !== null ? `median ${dev > 0 ? '+' : ''}${dev}% vs guide` : null].filter(Boolean).join(' · ')),
      likely !== null ? h('div', { class: 'sub' }, `Likely sale price: ${money(likely)}`) : null,
      recent.length ? h('table', { class: 'mini', 'aria-label': 'Recent agency sales: guide vs sold' }, ...recent.map((x: any) =>
        h('tr', {}, h('td', {}, `${money(pickNumber(x, ['guide_price']))} → ${money(pickNumber(x, ['sold_price']))}`), h('td', {}, x.diff_pct !== undefined ? `${x.diff_pct > 0 ? '+' : ''}${x.diff_pct}%` : '')))) : null,
      alert ? h('div', { class: 'sub', role: 'note', style: 'margin-top:6px;font-weight:600' }, 'Treat the advertised guide as a floor, not an estimate.') : null,
    ].filter(Boolean) as HTMLElement[];
  }, alert ? 'alert' : '');
}

export function avmRange(d: unknown): AvmRange | null {
  const mid = pickNumber(d, ['predicted_price', 'value', 'estimate', 'mid']);
  const low = pickNumber(d, ['predicted_price_low', 'low', 'lower']);
  const high = pickNumber(d, ['predicted_price_high', 'high', 'upper']);
  return mid !== null && low !== null && high !== null && high > low ? { low, mid, high } : null;
}

function rangeBar(rng: AvmRange, guide: number | null): HTMLElement {
  const lo = Math.min(rng.low, guide ?? rng.low) * 0.92;
  const hi = Math.max(rng.high, guide ?? rng.high) * 1.08;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return h('div', { class: 'range', role: 'img', 'aria-label': `80% range ${money(rng.low)} to ${money(rng.high)}, estimate ${money(rng.mid)}${guide ? `, your guide ${money(guide)}` : ''}` },
    h('div', { class: 'track' }),
    h('div', { class: 'band', style: `left:${pos(rng.low)};width:calc(${pos(rng.high)} - ${pos(rng.low)})` }),
    h('div', { class: 'mid', style: `left:${pos(rng.mid)}` }),
    guide !== null ? h('div', { class: 'guide', style: `left:${pos(guide)}` }) : null);
}

export function avmCard(fact: Fact | undefined, guideState: { value: string }): HTMLElement {
  return card('Microburbs value', fact, (d) => {
    const rng = avmRange(d);
    if (!rng) return null;
    const conf = pickNumber(d, ['confidence', 'confidence_score', 'accuracy']);
    const barSlot = h('div', {}, rangeBar(rng, parseGuidePrice(guideState.value)));
    const verdict = h('div', { class: 'guide-verdict', 'aria-live': 'polite' });
    const update = () => {
      const g = parseGuidePrice(guideState.value);
      barSlot.replaceChildren(rangeBar(rng, g));
      if (g === null) { verdict.className = 'guide-verdict'; verdict.textContent = ''; return; }
      const c = compareGuide(g, rng);
      verdict.className = `guide-verdict ${c.position}`;
      verdict.textContent = c.position === 'below'
        ? `Guide ${money(g)} is below the 80% range: ${Math.abs(Math.round(c.gapPct))}% under the estimate.`
        : c.position === 'above' ? `Guide ${money(g)} is above the 80% range.` : `Guide ${money(g)} sits inside the range.`;
    };
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'e.g. $1.1m', 'aria-label': 'Guide price you were quoted', value: guideState.value,
      onInput: (e: Event) => { guideState.value = (e.target as HTMLInputElement).value; update(); } });
    queueMicrotask(update);
    const date = pickString(d, ['prediction_date', 'date']);
    return [
      h('div', { class: 'big' }, money(rng.mid)),
      h('div', { class: 'sub' }, `80% range ${money(rng.low)} – ${money(rng.high)}${date ? ` · as of ${date}` : ''}`),
      barSlot,
      h('div', { class: 'range-labels' }, h('span', {}, money(rng.low)), h('span', {}, money(rng.high))),
      conf !== null ? h('div', { class: 'conf' }, h('span', {}, 'confidence'), h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, conf <= 1 ? conf * 100 : conf)}%` })), h('span', {}, pct(conf))) : null,
      h('label', { class: 'sub', style: 'display:block;margin-top:10px' }, 'Type the guide you were given (stays on this page):'),
      h('div', { class: 'guide-row' }, input),
      verdict,
    ].filter(Boolean) as HTMLElement[];
  }, 'hero');
}

export function saleHistoryCard(fact: Fact | undefined): HTMLElement {
  return card('Last sales', fact, (d) => {
    const list = Array.isArray(d) ? d : Array.isArray(d?.sales) ? d.sales : null;
    if (!list || list.length === 0) return [h('div', { class: 'big' }, 'No recorded sales')];
    const rows = list.slice(0, 4).map((s: any) => h('tr', {},
      h('td', {}, String(s.date ?? s.sold_date ?? '').slice(0, 10) || '—'),
      h('td', {}, pickNumber(s, ['price', 'sold_price']) !== null ? money(pickNumber(s, ['price', 'sold_price'])) : String(s.type ?? '—'))));
    return [h('table', { class: 'mini' }, ...rows)];
  });
}

export function streetCard(fact: Fact | undefined): HTMLElement {
  return card('Street vs suburb', fact, (d) => {
    const st = d?.profile ?? d;
    const sub = d?.suburb_medians ?? {};
    const rows: Array<[string, number | null, number | null, (n: number) => string]> = [
      ['growth forecast /yr', pickNumber(st, ['annual_4y']), pickNumber(sub, ['annual_4y']), (n) => `${n}%`],
      ['past growth /yr', pickNumber(st, ['past_growth_pct']), pickNumber(sub, ['past_growth_pct']), (n) => `${n}%`],
      ['renters', pickNumber(st, ['renters_pct']), pickNumber(sub, ['renters_pct']), (n) => `${n}%`],
    ];
    const shown = rows.filter(([, a, b]) => a !== null || b !== null);
    if (!shown.length) return null;
    const band = pickString(d?.forecast_rank, ['band']);
    const title = pickString(st, ['title']) ?? pickString(d, ['street']) ?? 'This street';
    return [
      h('table', { class: 'mini' },
        h('tr', {}, h('td', {}, ''), h('td', {}, `${title} · suburb`)),
        ...shown.map(([label, a, b, f]) => h('tr', {}, h('td', {}, label), h('td', {}, `${a !== null ? f(a) : '—'} · ${b !== null ? f(b) : '—'}`)))),
      band ? h('div', { class: 'sub', style: 'margin-top:6px' }, `Street forecast rank: ${band}`) : null,
    ].filter(Boolean) as HTMLElement[];
  });
}

export function risksCard(fact: Fact | undefined): HTMLElement {
  return card('Risk overlays', fact, (d) => {
    if (!d || typeof d !== 'object') return null;
    const items = Object.entries(d as Record<string, unknown>).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x: any) => ({ k, x })));
    if (!items.length) return [h('div', { class: 'big' }, 'No overlays flagged')];
    return items.slice(0, 8).map(({ k, x }) => {
      const on = x?.on_property === true;
      const label = typeof x?.name === 'string' ? x.name : humanKey(k);
      const val = typeof x?.value === 'string' ? x.value : on ? 'On property' : typeof x === 'string' ? x : '';
      return h('div', { class: 'risk' }, h('span', {}, label), h('span', { class: on ? 'on' : 'off' }, val || (on ? 'On property' : 'Clear')));
    });
  });
}

export function strataCard(fact: Fact | undefined): HTMLElement {
  return card('Strata levy (suburb median)', fact, (d) => {
    const levy = pickNumber(d, ['median_levy_annual', 'levy_annual', 'median_levy']);
    if (levy === null) return null;
    const n = pickNumber(d, ['n_properties', 'count']);
    const area = pickString(d, ['area_name', 'suburb']);
    return [h('div', { class: 'big' }, `${money(levy)}/yr`), h('div', { class: 'sub' }, `${money(levy / 4)} a quarter${area ? ` · ${area}` : ''}${n !== null ? ` · ${n} buildings` : ''}`)];
  });
}

export function basicsSection(fact: Fact | undefined): HTMLElement {
  const inner = fact?.available && fact.data ? scalarRows(fact.data, 10) : null;
  return h('details', { class: 'card basics' }, h('summary', {}, 'Basics'),
    inner ?? h('div', { class: 'sub', style: 'margin-top:6px' }, fact?.reason ?? 'Not available for this home'));
}

export function factCards(facts: FactsResponse, guideState: { value: string }): HTMLElement[] {
  const f = facts.facts;
  return [agentQuotingCard(f.agentQuoting), avmCard(f.avm, guideState), saleHistoryCard(f.saleHistory),
    streetCard(f.streetProfile), risksCard(f.risks), strataCard(f.strataLevy), basicsSection(f.basics)];
}
