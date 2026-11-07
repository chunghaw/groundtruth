import type { Fact, FactsResponse } from '../api-types';
import { h } from './dom';
import { compareGuide, money, parseGuidePrice, pct, pickNumber, pickString, type AvmRange } from './format';
import { offerCeilingCard, type GuideBus } from './offerCard';

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

function card(title: string, fact: Fact | undefined, body: (data: any) => HTMLElement[] | null, extraClass = '', source = 'Microburbs'): HTMLElement {
  if (!fact || !fact.available || fact.data === null || fact.data === undefined) {
    return h('section', { class: 'card na', 'aria-label': title },
      h('h3', {}, title), h('div', { class: 'big' }, fact?.reason ? `Not available: ${fact.reason}` : 'Not available for this home'));
  }
  let content: HTMLElement[] | null = null;
  try { content = body(fact.data); } catch { content = null; }
  const fallback = scalarRows(fact.data);
  return h('section', { class: `card ${extraClass}`.trim(), 'aria-label': title }, h('h3', {}, title),
    ...(content ?? (fallback ? [fallback] : [h('div', { class: 'sub' }, 'Data received, nothing to summarise.')])),
    h('div', { class: 'src' }, `Source: ${source}`));
}

/** Big figure + unit, so the number carries the weight and the words explain it. */
function bigFigure(num: string, unit = ''): HTMLElement {
  return h('div', { class: 'big' }, num, unit ? h('span', { class: 'u' }, /^[a-z]/i.test(unit) ? ` ${unit}` : unit) : null);
}

/** Show the first `keep` items; the rest sit behind a "+N more" reveal. */
function reveal(items: HTMLElement[], keep: number, noun: string): HTMLElement[] {
  if (items.length <= keep) return items;
  const rest = items.slice(keep);
  rest.forEach((el) => { el.hidden = true; });
  const btn = h('button', { class: 'more', type: 'button', 'aria-expanded': 'false', onClick: () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    rest.forEach((el) => { el.hidden = !open; });
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Show less' : `+${rest.length} more ${noun}`;
  } }, `+${rest.length} more ${noun}`);
  return [...items, btn];
}

/** Linear accuracy scale: where the agency's median sale lands relative to its guide. */
function deviationScale(dev: number): HTMLElement {
  const lo = -10, hi = 20;
  const clamp = Math.max(lo, Math.min(hi, dev));
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return h('div', { class: 'scale', role: 'img', 'aria-label': `Median sale ${dev > 0 ? '+' : ''}${dev}% versus guide` },
    h('div', { class: 'scale-track' }, h('i', { class: 'zone ok', style: `left:${pos(-3)};width:calc(${pos(3)} - ${pos(-3)})` }),
      h('i', { class: 'zone warn', style: `left:${pos(3)};right:0` }),
      h('b', { class: 'zero', style: `left:${pos(0)}` }),
      h('b', { class: 'marker', style: `left:${pos(clamp)}` }, h('span', {}, `${dev > 0 ? '+' : ''}${dev}%`))),
    h('div', { class: 'scale-labels' }, h('span', {}, `${lo}%`), h('span', { style: `left:${pos(0)}` }, 'at guide'), h('span', {}, `+${hi}%`)));
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
    const rows = recent.map((x: any) => {
      const diff = pickNumber(x, ['diff_pct']);
      return h('li', {}, h('span', { class: 'when' }, String(x.sold_date ?? x.date ?? '').slice(0, 10) || 'recent'),
        h('span', { class: 'what' }, `${money(pickNumber(x, ['guide_price']))} → ${money(pickNumber(x, ['sold_price']))}`),
        diff !== null ? h('span', { class: `delta ${diff > 3 ? 'up' : diff < -3 ? 'down' : ''}` }, `${diff > 0 ? '+' : ''}${diff}%`) : null);
    });
    return [
      r !== null ? bigFigure(pct(r), 'of sales beat the guide') : h('div', { class: 'big' }, cohort ?? ''),
      h('div', { class: 'sub' }, [agency, cohort, n !== null ? `${n} tracked sales` : null].filter(Boolean).join(' · ')),
      dev !== null ? deviationScale(dev) : null,
      likely !== null ? h('div', { class: 'kv' }, h('span', {}, 'Likely sale price'), h('b', {}, money(likely))) : null,
      rows.length ? h('ol', { class: 'tl', 'aria-label': 'Recent agency sales: guide vs sold' }, ...reveal(rows, 2, 'sales')) : null,
      alert ? h('div', { class: 'note', role: 'note' }, 'Treat the advertised guide as a floor, not an estimate.') : null,
    ].filter(Boolean) as HTMLElement[];
  }, alert ? 'alert' : '', 'Microburbs · agency sales, guide vs sold');
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

/** With `listeners`, the guide input lives in the Realistic budget card and this card only reacts to it. */
export function avmCard(fact: Fact | undefined, guideState: { value: string }, listeners?: Array<() => void>): HTMLElement {
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
    if (listeners) listeners.push(update);
    queueMicrotask(update);
    const date = pickString(d, ['prediction_date', 'date']);
    return [
      bigFigure(money(rng.mid), 'estimate'),
      h('div', { class: 'sub' }, `80% range ${money(rng.low)} – ${money(rng.high)}${date ? ` · as of ${date}` : ''}`),
      barSlot,
      h('div', { class: 'range-labels' }, h('span', {}, money(rng.low)), h('span', {}, money(rng.high))),
      conf !== null ? h('div', { class: 'conf' }, h('span', {}, 'confidence'), h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, conf <= 1 ? conf * 100 : conf)}%` })), h('span', {}, pct(conf))) : null,
      listeners ? null : h('label', { class: 'sub', style: 'display:block;margin-top:10px' }, 'Type the guide you were given (stays on this page):'),
      listeners ? null : h('div', { class: 'guide-row' }, input),
      verdict,
    ].filter(Boolean) as HTMLElement[];
  }, 'hero', 'Microburbs automated valuation');
}

export function saleHistoryCard(fact: Fact | undefined): HTMLElement {
  return card('Last sales', fact, (d) => {
    const list = Array.isArray(d) ? d : Array.isArray(d?.sales) ? d.sales : null;
    if (!list || list.length === 0) return [h('div', { class: 'big' }, 'No recorded sales')];
    const sorted = [...list].sort((a: any, b: any) => String(b.date ?? b.sold_date ?? '').localeCompare(String(a.date ?? a.sold_date ?? '')));
    const rows = sorted.slice(0, 8).map((x: any, i: number) => {
      const price = pickNumber(x, ['price', 'sold_price']);
      const prev = pickNumber(sorted[i + 1], ['price', 'sold_price']);
      const ch = price !== null && prev ? ((price - prev) / prev) * 100 : null;
      return h('li', {}, h('span', { class: 'when' }, String(x.date ?? x.sold_date ?? '').slice(0, 10) || '—'),
        h('span', { class: 'what' }, price !== null ? money(price) : String(x.type ?? '—')),
        ch !== null ? h('span', { class: 'delta' }, `${ch >= 0 ? '+' : ''}${Math.round(ch)}%`) : null);
    });
    return [h('ol', { class: 'tl', 'aria-label': 'Sales of this home' }, ...reveal(rows, 3, 'sales'))];
  }, '', 'Microburbs sale history · this exact home');
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
        h('tr', { class: 'head' }, h('td', {}, ''), h('td', {}, `${title} · suburb`)),
        ...shown.map(([label, a, b, f]) => h('tr', {}, h('td', {}, label), h('td', {}, `${a !== null ? f(a) : '—'} · ${b !== null ? f(b) : '—'}`)))),
      band ? h('div', { class: 'kv' }, h('span', {}, 'Street forecast rank'), h('b', {}, band)) : null,
    ].filter(Boolean) as HTMLElement[];
  }, '', 'Microburbs street profile, ABS Census');
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
  }, '', 'Microburbs risk overlays');
}

export function strataCard(fact: Fact | undefined): HTMLElement {
  return card('Strata levy (suburb median)', fact, (d) => {
    const levy = pickNumber(d, ['median_levy_annual', 'levy_annual', 'median_levy']);
    if (levy === null) return null;
    const n = pickNumber(d, ['n_properties', 'count']);
    const area = pickString(d, ['area_name', 'suburb']);
    return [bigFigure(money(levy), '/yr'), h('div', { class: 'sub' }, `${money(levy / 4)} a quarter${area ? ` · ${area}` : ''}${n !== null ? ` · ${n} buildings` : ''}`)];
  }, '', 'Microburbs strata data');
}

export function basicsSection(fact: Fact | undefined): HTMLElement {
  const inner = fact?.available && fact.data ? scalarRows(fact.data, 10) : null;
  return h('details', { class: 'card basics' }, h('summary', {}, 'Basics'),
    inner ?? h('div', { class: 'sub', style: 'margin-top:6px' }, fact?.reason ?? 'Not available for this home'));
}

export function factCards(facts: FactsResponse, guideState: { value: string }): HTMLElement[] {
  const f = facts.facts;
  const bus: GuideBus = { state: guideState, listeners: [] };
  return [agentQuotingCard(f.agentQuoting), offerCeilingCard(f.avm, f.agentQuoting, bus), avmCard(f.avm, guideState, bus.listeners), saleHistoryCard(f.saleHistory),
    streetCard(f.streetProfile), risksCard(f.risks), strataCard(f.strataLevy), basicsSection(f.basics)];
}
