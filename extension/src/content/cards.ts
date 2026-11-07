import type { Fact, FactsResponse } from '../api-types';
import { h } from './dom';
import { compareGuide, money, parseGuidePrice, pct, pctValue, pickNumber, pickString, type AvmRange } from './format';
import { offerCeilingCard, type GuideBus } from './offerCard';
import { avmLine, avmTone } from './offer';
import { fmtPct, salesAboveGuide } from './verdict';

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

function card(title: string, fact: Fact | undefined, body: (data: any) => HTMLElement[] | null, extraClass = '', source = 'Microburbs', heading = title): HTMLElement {
  if (!fact || !fact.available || fact.data === null || fact.data === undefined) {
    return h('section', { class: 'card na', 'aria-label': title },
      h('h3', {}, heading), h('div', { class: 'big' }, fact?.reason ? `Not available: ${fact.reason}` : 'Not available for this home'));
  }
  let content: HTMLElement[] | null = null;
  try { content = body(fact.data); } catch { content = null; }
  const fallback = scalarRows(fact.data);
  return h('section', { class: `card ${extraClass}`.trim(), 'aria-label': title }, h('h3', { title: `Source: ${source}` }, heading),
    ...(content ?? (fallback ? [fallback] : [h('div', { class: 'sub' }, 'Nothing to summarise.')])));
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03-14" → "Mar 2026"; null when unparseable. */
export function monthYear(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const i = m ? Number(m[2]) - 1 : -1;
  return m && i >= 0 && i < 12 ? `${MONTHS[i]} ${m[1]}` : null;
}

const ABBR: ReadonlyArray<[RegExp, string]> = [[/\bRoad\b/gi, 'Rd'], [/\bStreet\b/gi, 'St'], [/\bAvenue\b/gi, 'Ave'], [/\bParade\b/gi, 'Pde'], [/\bPlace\b/gi, 'Pl'], [/\bLane\b/gi, 'Ln'], [/\bDrive\b/gi, 'Dr'], [/\bCrescent\b/gi, 'Cres'], [/\bHighway\b/gi, 'Hwy'], [/\bTerrace\b/gi, 'Tce']];
/** "5/68 Bayswater Road, Rushcutters Bay NSW 2011" → "5/68 Bayswater Rd, Rushcutters Bay". */
export function shortAddress(a: string | null): string | null {
  if (!a) return null;
  let s = a.replace(/[,\s]+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b[\s,]*(\d{4})?\s*$/i, '').replace(/[,\s]+\d{4}\s*$/, '');
  for (const [re, to] of ABBR) s = s.replace(re, to);
  const t = s.replace(/\s+/g, ' ').trim();
  return t || null;
}

const signedPct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtPct(n)}%`;

/** "Mild Underquoter" → "Mild underquoter". */
const cohortLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();

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
    const above = salesAboveGuide(data);
    const headline = above ?? (r !== null ? `${pct(r)} sold above guide` : null);
    const typical = dev !== null
      ? `Typically ${signedPct(dev)}`
      : null;
    const recent = Array.isArray(data?.recent_sales) ? data.recent_sales.slice(0, 3) : [];
    const rows = recent.map((x: any) => {
      const diff = pickNumber(x, ['diff_pct']);
      const addr = shortAddress(pickString(x, ['address', 'street_address']));
      const when = monthYear(String(x.sold_date ?? x.date ?? ''));
      return h('li', {},
        h('span', { class: 'what' }, `Guide ${money(pickNumber(x, ['guide_price']))} → ${money(pickNumber(x, ['sold_price']))}`),
        diff !== null ? h('span', { class: `delta ${diff > 3 ? 'up' : diff < -3 ? 'down' : ''}` }, ` (${signedPct(diff)})`) : null,
        addr || when ? h('small', { class: 'addr', style: 'display:block;font-size:11px;opacity:.7' }, [addr, when].filter(Boolean).join(' · ')) : null);
    });
    return [
      headline ? h('div', { class: 'big aq-head' }, headline) : null,
      typical || agency ? h('div', { class: 'sub' }, [typical, agency].filter(Boolean).join(' · ')) : null,
      cohort ? h('span', { class: 'cohort-pill' }, cohortLabel(cohort)) : null,
      dev !== null ? h('div', { class: 'scale-title' }, 'Sold vs guide') : null,
      dev !== null ? deviationScale(dev) : null,
      rows.length ? h('div', { class: 'scale-title aq-others' }, 'Recent sales') : null,
      rows.length ? h('ol', { class: 'tl aq-sales', 'aria-label': 'This agency’s other recent sales: guide vs sold' }, ...reveal(rows, 2, 'sales')) : null,
      alert ? h('div', { class: 'note', role: 'note' }, 'Treat the guide as a floor.') : null,
    ].filter(Boolean) as HTMLElement[];
  }, alert ? 'alert' : '', 'Microburbs · agency sales, guide vs sold', 'Agency quoting');
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

/** With `listeners`, the guide input lives in the guide-check card and this card only reacts to it. */
export function avmCard(fact: Fact | undefined, guideState: { value: string }, listeners?: Array<() => void>): HTMLElement {
  const el = card('Microburbs value', fact, (d) => {
    const rng = avmRange(d);
    if (!rng) return null;
    const conf = pickNumber(d, ['confidence', 'confidence_score', 'accuracy']);
    const barSlot = h('div', {}, rangeBar(rng, parseGuidePrice(guideState.value)));
    const verdict = h('div', { class: 'guide-verdict', 'aria-live': 'polite' });
    const update = () => {
      const g = parseGuidePrice(guideState.value);
      barSlot.replaceChildren(rangeBar(rng, g));
      if (g === null) { verdict.className = 'guide-verdict'; verdict.textContent = ''; return; }
      // Same tone as the guide-check card's AVM comparison, so one fact never shows in two colours.
      verdict.className = `guide-verdict ${compareGuide(g, rng).position} ${avmTone(g, { predicted: rng.mid, low: rng.low, high: rng.high })}`;
      verdict.textContent = avmLine(g, rng);
    };
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'e.g. $1.1m', 'aria-label': 'Guide price you were quoted', value: guideState.value,
      onInput: (e: Event) => { guideState.value = (e.target as HTMLInputElement).value; update(); } });
    if (listeners) listeners.push(update);
    queueMicrotask(update);
    const date = pickString(d, ['prediction_date', 'date']);
    return [
      h('div', { class: 'big', title: `80% range${date ? ` · as of ${date}` : ''}` }, `${money(rng.low)} – ${money(rng.high)}`),
      barSlot,
      h('div', { class: 'range-labels' }, h('span', {}, money(rng.low)), h('span', {}, money(rng.high))),
      conf !== null ? h('div', { class: 'conf' }, h('span', {}, 'confidence'), h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, conf <= 1 ? conf * 100 : conf)}%` })), h('span', {}, pct(conf))) : null,
      listeners ? null : h('label', { class: 'sub', style: 'display:block;margin-top:10px' }, 'Your guide'),
      listeners ? null : h('div', { class: 'guide-row' }, input),
      verdict,
    ].filter(Boolean) as HTMLElement[];
  }, 'hero', 'Microburbs automated valuation');
  // aria-label stays 'Microburbs value' (video shots select it); the visible title says what it now shows.
  const h3 = el.querySelector('h3');
  if (h3 && !el.classList.contains('na')) h3.textContent = 'Value range';
  return el;
}

export function saleHistoryCard(fact: Fact | undefined): HTMLElement {
  return card('Last sales', fact, (d) => {
    const list = Array.isArray(d) ? d : Array.isArray(d?.sales) ? d.sales : null;
    if (!list || list.length === 0) return [h('div', { class: 'big' }, 'No recorded sales')];
    const byDate = [...list].sort((a: any, b: any) => String(b.date ?? b.sold_date ?? '').localeCompare(String(a.date ?? a.sold_date ?? '')));
    // Only real sales go in "Last sales"; listings (for sale / listed) are shown muted underneath.
    const isSold = (x: any) => !x?.type || /sold/i.test(String(x.type));
    const sorted = byDate.filter(isSold);
    const listed = byDate.filter((x: any) => !isSold(x) && pickNumber(x, ['price', 'sold_price']) !== null).slice(0, 2);
    const listedEls = listed.map((x: any) => {
      const when = monthYear(String(x.date ?? '').slice(0, 10)) ?? '';
      return h('div', { class: 'sub listed' }, `Listed ${money(pickNumber(x, ['price', 'sold_price'])!)}${when ? ` · ${when}` : ''}`);
    });
    if (sorted.length === 0) return [h('div', { class: 'big' }, 'No recorded sales'), ...listedEls];
    const rows = sorted.slice(0, 8).map((x: any, i: number) => {
      const price = pickNumber(x, ['price', 'sold_price']);
      const prev = pickNumber(sorted[i + 1], ['price', 'sold_price']);
      const ch = price !== null && prev ? ((price - prev) / prev) * 100 : null;
      return h('li', {}, h('span', { class: 'when' }, String(x.date ?? x.sold_date ?? '').slice(0, 10) || '—'),
        h('span', { class: 'what' }, price !== null ? money(price) : String(x.type ?? '—')),
        ch !== null ? h('span', { class: 'delta' }, `${ch >= 0 ? '+' : ''}${Math.round(ch)}%`) : null);
    });
    return [h('ol', { class: 'tl', 'aria-label': 'Sales of this home' }, ...reveal(rows, 3, 'sales')), ...listedEls];
  }, '', 'Microburbs sale history · this exact home');
}

export function streetCard(fact: Fact | undefined): HTMLElement {
  return card('Street vs suburb', fact, (d) => {
    const st = d?.profile ?? d;
    const sub = d?.suburb_medians ?? {};
    const rows: Array<[string, number | null, number | null, (n: number) => string]> = [
      ['growth forecast /yr', pickNumber(st, ['annual_4y']), pickNumber(sub, ['annual_4y']), pctValue],
      ['past growth /yr', pickNumber(st, ['past_growth_pct']), pickNumber(sub, ['past_growth_pct']), pctValue],
      ['renters', pickNumber(st, ['renters_pct']), pickNumber(sub, ['renters_pct']), pctValue],
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

const RISK_MEANINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/heritage/i, 'May limit renovations'],
  [/flood/i, 'Affects insurance and building'],
  [/bush ?fire/i, 'Adds building costs'],
  [/power|transmission|electric|\bhv\b/i, 'High-voltage line close by'],
  [/aircraft|anef|noise/i, 'Noise may be noticeable'],
  [/contaminat/i, 'May need a soil check'],
  [/acid/i, 'Can raise building costs'],
  [/landslip|slope|geotech/i, 'May need an engineer’s report'],
  [/biodiversity|vegetation|tree/i, 'May limit clearing or extensions'],
  [/coast|foreshore/i, 'May limit building'],
];

/** One plain line on what an on-property overlay means for a buyer. */
export function riskMeaning(name: string): string {
  return RISK_MEANINGS.find(([re]) => re.test(name))?.[1] ?? 'Check with the council';
}

/** An HV power line within 50 m is amber, not "Clear". */
export function powerLineNear(name: string, x: any, val: string): boolean {
  if (!/power|transmission|electric|\bhv\b/i.test(name)) return false;
  const d = pickNumber(x, ['distance_m', 'distance', 'dist_m']) ?? (Number(/(\d+(?:\.\d+)?)\s*m\b/.exec(val)?.[1] ?? NaN));
  return Number.isFinite(d) ? d < 50 : /under 50|within 50|<\s*50/i.test(val);
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
      const near = powerLineNear(`${k} ${label}`, x, val);
      const cls = on ? 'on' : near ? 'warn' : 'off';
      const why = on || near ? riskMeaning(`${k} ${label}`) : null;
      return h('div', { class: 'risk' },
        h('span', {}, label, why ? h('small', { class: 'risk-why' }, why) : null),
        h('span', { class: cls }, val || (on ? 'On property' : 'Clear')));
    });
  }, '', 'Microburbs risk overlays', 'Risks');
}

export function strataCard(fact: Fact | undefined): HTMLElement {
  return card('Strata levy (suburb median)', fact, (d) => {
    const levy = pickNumber(d, ['median_levy_annual', 'levy_annual', 'median_levy']);
    if (levy === null) return null;
    const n = pickNumber(d, ['n_properties', 'count']);
    const area = pickString(d, ['area_name', 'suburb']);
    return [bigFigure(money(levy), '/yr'), h('div', { class: 'sub', title: `Suburb median${area ? ` · ${area}` : ''}${n !== null ? ` · ${n} buildings` : ''}` }, `${money(levy / 4)} a quarter`)];
  }, '', 'Microburbs strata data', 'Strata levy');
}

export function basicsSection(fact: Fact | undefined): HTMLElement {
  const inner = fact?.available && fact.data ? scalarRows(fact.data, 10) : null;
  return h('details', { class: 'card basics' }, h('summary', {}, 'Basics'),
    inner ?? h('div', { class: 'sub', style: 'margin-top:6px' }, fact?.reason ?? 'Not available for this home'));
}

export const isAvailable = (f: Fact | undefined): f is Fact => !!f && f.available && f.data !== null && f.data !== undefined;

/** One quiet collapsed line instead of a dashed card per missing fact. */
export function unavailableLine(missing: ReadonlyArray<{ label: string; fact: Fact | undefined }>): HTMLElement | null {
  if (!missing.length) return null;
  return h('details', { class: 'na-line', 'aria-label': 'Not available for this home' },
    h('summary', {}, h('span', {}, `Not available: ${missing.map((m) => m.label).join(', ')} · `), h('span', { class: 'why' }, 'why?')),
    h('ul', {}, ...missing.map((m) => h('li', {}, h('b', {}, m.label), ` ${m.fact?.reason ?? 'no data returned for this home'}`))));
}

/** `lead` sits right under the verdict (agency quoting, only when it exists); `rest` follows the 3D card. */
export function factSections(facts: FactsResponse, guideState: { value: string }): { lead: HTMLElement[]; rest: HTMLElement[] } {
  const f = facts.facts;
  const bus: GuideBus = { state: guideState, listeners: [] };
  const missing: Array<{ label: string; fact: Fact | undefined }> = [];
  const when = (label: string, fact: Fact | undefined, make: () => HTMLElement): HTMLElement | null => {
    if (isAvailable(fact)) return make();
    missing.push({ label, fact });
    return null;
  };
  const lead = [when('agency', f.agentQuoting, () => agentQuotingCard(f.agentQuoting))];
  const value = isAvailable(f.avm) || isAvailable(f.agentQuoting) ? offerCeilingCard(f.avm, f.agentQuoting, bus) : null;
  const rest = [
    value,
    when('value', f.avm, () => avmCard(f.avm, guideState, value ? bus.listeners : undefined)),
    when('street', f.streetProfile, () => streetCard(f.streetProfile)),
    when('sales', f.saleHistory, () => saleHistoryCard(f.saleHistory)),
    when('risks', f.risks, () => risksCard(f.risks)),
    when('strata', f.strataLevy, () => strataCard(f.strataLevy)),
    isAvailable(f.basics) ? basicsSection(f.basics) : null,
  ];
  if (!isAvailable(f.basics)) missing.push({ label: 'basics', fact: f.basics });
  const keep = (xs: Array<HTMLElement | null>) => xs.filter((x): x is HTMLElement => !!x);
  return { lead: keep(lead), rest: keep([...rest, unavailableLine(missing)]) };
}

export function factCards(facts: FactsResponse, guideState: { value: string }): HTMLElement[] {
  const { lead, rest } = factSections(facts, guideState);
  return [...lead, ...rest];
}
