import type { Candidate, FactsResponse, MatchState, ResolveResponse } from '../api-types';
import type { Extraction } from '../extract/types';
import { factSections } from './cards';
import { h } from './dom';
import { PANEL_CSS } from './styles';
import { BriefingControl, BRIEFING_CSS, type BriefingDeps } from './briefing';
import { OFFER_CSS } from './offerCard';
import { context3dCard, CONTEXT3D_CSS } from '../context3d/card';
import { factsVerdict, headroomVerdict, priceBlockEl, priceCheck, quotingVerdict, verdictEl, type Verdict } from './verdict';
import type { Context3DHost, HeadroomInsight } from '../context3d/types';

/** How long the verdict waits for the 3D headroom finding before settling on the next fallback. */
const HEADROOM_WAIT_MS = 9000;

export type PanelView =
  | { readonly kind: 'loading'; readonly ex: Extraction }
  | { readonly kind: 'error'; readonly ex: Extraction | null; readonly message: string }
  | { readonly kind: 'manual'; readonly prefill: string }
  | { readonly kind: 'result'; readonly ex: Extraction; readonly resolve: ResolveResponse; readonly facts: FactsResponse | null;
      readonly factsPending?: boolean; readonly factsError?: string; readonly bedrooms: number | null; readonly picked?: Candidate };

export interface PanelHandlers {
  readonly onBedrooms: (n: number) => void;
  readonly onPick: (c: Candidate) => void;
  readonly onManual: (text: string) => void;
  readonly onRetry: () => void;
}

/** Optional host settings: the extension uses defaults; the web demo embeds the panel in a container. */
export interface PanelOptions {
  /** Render inside this element (static layout) instead of a fixed overlay on <html>. */
  readonly container?: HTMLElement;
  /** Override the "from" site label in the match receipt. */
  readonly siteLabel?: (ex: Extraction) => string;
  /** Plumbing for the spoken 30-second briefing; omitted -> no button. */
  readonly briefing?: BriefingDeps;
  /** Data + map surface for the "What can rise next door" 3D card; omitted -> no card. */
  readonly context3d?: Context3DHost;
}

type PanelState = MatchState | 'LOADING' | 'ERROR';

const STATE_LABEL: Record<PanelState, string> = {
  EXACT: 'Exact', BUILDING: 'Building', CHOOSE: 'Choose', NO_MATCH: 'No match', OUT_OF_AREA: 'Out of area', LOADING: 'Reading', ERROR: 'Offline',
};
const DOT: Record<PanelState, string> = { EXACT: '#157347', BUILDING: '#a85a00', CHOOSE: '#1b4fd8', NO_MATCH: '#b42318', OUT_OF_AREA: '#8a93a2', LOADING: '#8a93a2', ERROR: '#b42318' };
const STRIP_TITLE: Record<PanelState, string> = {
  EXACT: 'Verified home', BUILDING: 'Building verified', CHOOSE: 'Several homes match', NO_MATCH: 'Not verified', OUT_OF_AREA: 'Outside coverage', LOADING: 'Reading the address…', ERROR: 'Not checked yet',
};
const SEAL: Record<PanelState, string> = { EXACT: '✓', BUILDING: '?', CHOOSE: '?', NO_MATCH: '!', OUT_OF_AREA: '–', LOADING: '', ERROR: '!' };
const FROM_LABEL: Record<string, string> = { h1: 'page heading', 'h1+json-ld': 'heading ✓ structured data', __NEXT_DATA__: 'page data (id-matched)', manual: 'typed by you' };
const COVERAGE = ['Sydney', 'Surry Hills', 'Darlinghurst', 'Glebe', 'Pyrmont', 'Ultimo', 'Redfern', 'Newtown', 'Potts Point', 'Zetland', '+19 more'];

export class Panel {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly wrap: HTMLElement;
  private collapsed = false;
  /** null = follow the default for the state (closed for EXACT, open otherwise). */
  private receiptOpen: boolean | null = null;
  private view: PanelView | null = null;
  private guide = { value: '' };
  private readonly briefing: BriefingControl | null;
  /** `insight` undefined = the 3D card hasn't reported yet; null = it never will (no data / map failed / timed out). */
  private c3: { gnafId: string; el: HTMLElement; insight?: HeadroomInsight | null } | null = null;
  private verdictSlot: HTMLElement | null = null;
  private headroomTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly handlers: PanelHandlers, private readonly opts: PanelOptions = {}) {
    this.host = document.createElement('groundtruth-panel');
    this.root = this.host.attachShadow({ mode: 'closed' });
    this.root.append(h('style', {}, PANEL_CSS));
    this.root.append(h('style', {}, OFFER_CSS + BRIEFING_CSS));
    this.briefing = opts.briefing ? new BriefingControl(opts.briefing) : null;
    this.root.append(h('style', {}, CONTEXT3D_CSS));
    this.wrap = h('div', { class: 'gt' });
    this.root.append(this.wrap);
    try {
      this.collapsed = sessionStorage.getItem('gt:collapsed') === '1';
      const r = sessionStorage.getItem('gt:receipt');
      this.receiptOpen = r === null ? null : r === '1';
    } catch { /* storage blocked */ }
    this.mount();
  }

  /** Re-attach if the host page re-renders and drops us. */
  mount(): void {
    if (!this.host.isConnected) (this.opts.container ?? document.documentElement).append(this.host);
  }

  destroy(): void { this.briefing?.stop(); if (this.headroomTimer) clearTimeout(this.headroomTimer); this.host.remove(); }

  resetGuide(): void { this.guide = { value: '' }; }

  render(view: PanelView): void {
    this.view = view;
    this.mount();
    const state = this.stateOf(view);
    this.wrap.className = `gt${this.opts.container ? ' embedded' : ''}${this.collapsed ? ' collapsed' : ''}`;
    const tab = h('button', { class: 'tab', 'aria-expanded': String(!this.collapsed), 'aria-label': `Groundtruth: ${STATE_LABEL[state]}. ${this.collapsed ? 'Expand' : 'Collapse'} panel`, onClick: () => this.toggle() },
      h('span', { class: 'dot', style: `background:${DOT[state]}` }), 'Groundtruth');
    const body = [this.briefing && this.briefingGnaf(view) ? this.briefing.captions() : null, ...this.bodyFor(view)].filter((x): x is HTMLElement => !!x);
    body.forEach((el, i) => { if (el.classList.contains('brief-cap')) return; el.classList.add('rise'); el.style.setProperty('--i', String(Math.min(i, 10))); });
    const sheet = h('aside', { class: 'sheet', 'aria-label': 'Groundtruth property facts' },
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', { class: 'word' }, 'Groundtruth')),
        h('span', { class: `pill ${state}` }, STATE_LABEL[state]),
        h('div', { class: 'spacer' }),
        this.briefingButton(view),
        h('button', { class: 'icon-btn', 'aria-label': 'Collapse panel', title: 'Collapse to a slim tab', onClick: () => this.toggle() }, '⇥')),
      h('div', { class: 'body' }, ...body));
    this.wrap.replaceChildren(tab, sheet);
  }

  /** The home a briefing can talk about: a result with facts loaded. */
  private briefingGnaf(v: PanelView): string | null {
    if (v.kind !== 'result' || !v.facts) return null;
    return v.picked?.gnafId ?? v.resolve.gnafId ?? null;
  }

  private briefingButton(v: PanelView): HTMLElement | null {
    if (!this.briefing) return null;
    const gnafId = this.briefingGnaf(v);
    if (!gnafId) { this.briefing.release(); return null; }
    return this.briefing.button(gnafId);
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    try { sessionStorage.setItem('gt:collapsed', this.collapsed ? '1' : '0'); } catch { /* ignore */ }
    if (this.view) this.render(this.view);
  }

  private stateOf(v: PanelView): PanelState {
    if (v.kind === 'loading' || v.kind === 'manual') return 'LOADING';
    if (v.kind === 'error') return 'ERROR';
    return v.picked ? 'EXACT' : v.resolve.state;
  }

  private skeleton(): HTMLElement {
    const sk = (...lines: string[]) => h('div', { class: 'skel' }, ...lines.map((c) => h('div', { class: `shimmer ${c}` })));
    return h('div', { class: 'loading', 'aria-busy': 'true', 'aria-label': 'Looking up this home' },
      sk('w30', 'num', 'w80'), sk('w30', 'num', 'w55', 'w80'));
  }

  private bodyFor(v: PanelView): HTMLElement[] {
    switch (v.kind) {
      case 'loading':
        return [h('div', { class: 'verdict', 'aria-hidden': 'true' }, h('div', { class: 'shimmer w30' }), h('div', { class: 'shimmer h2', style: 'margin-top:10px' }), h('div', { class: 'shimmer w55', style: 'margin-top:8px' })),
          this.receipt(v.ex, null, undefined, 'LOADING'), this.skeleton()];
      case 'error':
        return [verdictEl({ kicker: 'Connection', headline: ['Can’t reach ', 'Groundtruth', ' right now'], sub: null, tone: 'bad' }),
          v.ex ? this.receipt(v.ex, null, undefined, 'ERROR') : null,
          h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Can’t reach Groundtruth'), v.message),
          h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => this.handlers.onRetry() }, 'Try again'),
            h('button', { class: 'btn ghost', onClick: () => this.render({ kind: 'manual', prefill: v.ex?.raw ?? '' }) }, 'Type address'))].filter(Boolean) as HTMLElement[];
      case 'manual':
        return [verdictEl({ kicker: 'Manual lookup', headline: ['Which ', 'home', ' should we check?'], sub: 'Type the full address, including the unit number if there is one.', tone: 'neutral' }), this.manualForm(v.prefill)];
      case 'result':
        return this.resultBody(v);
    }
  }

  private wrongHome(ex: Extraction): HTMLElement {
    return h('div', { class: 'msg' }, h('button', { class: 'link', onClick: () => this.render({ kind: 'manual', prefill: ex.raw }) }, 'Wrong home?'), ' Type the address yourself.');
  }

  private stateVerdict(st: PanelState, v: Extract<PanelView, { kind: 'result' }>): Verdict {
    const msg = v.resolve.message ?? null;
    switch (st) {
      case 'BUILDING': return { kicker: 'Building found', headline: ['Pick the ', 'unit', ' to see its facts'], sub: msg ?? 'The listing names the building, not the unit. We won’t guess.', tone: 'warn' };
      case 'CHOOSE': return { kicker: 'More than one match', headline: ['', `${v.resolve.candidates.length || 'Several'} homes`, ' share this address'], sub: msg ?? 'Pick the one in the listing.', tone: 'info' };
      case 'NO_MATCH': return { kicker: 'No match', headline: ['We couldn’t match ', 'this home', ''], sub: msg ?? 'A wrong home is worse than no answer, so we show nothing.', tone: 'bad' };
      case 'OUT_OF_AREA': return { kicker: 'Outside coverage', headline: ['This home is ', 'outside', ' the pilot area'], sub: msg ?? 'No data call was made.', tone: 'neutral' };
      default: return factsVerdict(v.facts);
    }
  }

  private resultBody(v: Extract<PanelView, { kind: 'result' }>): HTMLElement[] {
    const st = v.picked ? 'EXACT' : v.resolve.state;
    const cta = st === 'NO_MATCH'
      ? h('div', { class: 'vcta' }, h('button', { class: 'btn', onClick: () => this.render({ kind: 'manual', prefill: v.ex.raw }) }, 'Type the address'))
      : null;
    const c3 = this.context3d(v);
    const sections = st === 'EXACT' && !v.factsPending && v.facts ? factSections(v.facts, this.guide) : null;
    const verdict = st === 'EXACT' && v.factsPending ? this.pendingVerdict()
      : st === 'EXACT' && v.facts ? this.exactVerdict(v.facts)
      : verdictEl(this.stateVerdict(st, v), cta);
    const price = st === 'EXACT' && !v.factsPending && v.facts ? priceBlockEl(priceCheck(v.facts)) : null;
    const out: HTMLElement[] = [...(price ? [price] : []), verdict, this.receipt(v.ex, v.resolve, v.picked, st)];
    // Order: price block (when there is one) → verdict → verified strip → agency quoting (only if it exists) → 3D next door → value → street → sales → risks → strata → basics → "not available" line.
    if (sections) out.push(...sections.lead);
    if (c3) out.push(c3);
    if (st === 'BUILDING') out.push(this.buildingBlock(v));
    if (st === 'CHOOSE') out.push(this.candidateList('Which home is it?', v.resolve.candidates));
    if (st === 'OUT_OF_AREA') out.push(h('section', { class: 'card na' }, h('h3', {}, 'Where Groundtruth works'),
      h('div', { class: 'big' }, 'The 29 suburbs of the City of Sydney, for now.'), h('div', { class: 'coverage' }, ...COVERAGE.map((s) => h('span', {}, s)))));
    if (st === 'EXACT') {
      if (v.factsPending) out.push(this.skeleton());
      else if (sections) out.push(...sections.rest);
      else out.push(h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Facts unavailable'), v.factsError ?? 'The proxy did not return facts.',
        h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn', onClick: () => this.handlers.onRetry() }, 'Try again'))));
    }
    out.push(this.wrongHome(v.ex));
    out.push(h('div', { class: 'foot' }, h('span', {}, 'Only the address was read from this page.'), h('span', {}, 'Data: Microburbs · G-NAF')));
    return out;
  }

  /** 3D card for EXACT (the home) or BUILDING (any unit shares the lot). Reused across re-renders so the map survives. */
  private context3d(v: Extract<PanelView, { kind: 'result' }>): HTMLElement | null {
    const st = v.picked ? 'EXACT' : v.resolve.state;
    if (!this.opts.context3d || (st !== 'EXACT' && st !== 'BUILDING')) return null;
    const gnafId = v.picked?.gnafId ?? v.resolve.gnafId ?? v.resolve.candidates[0]?.gnafId ?? null;
    if (!gnafId) return null;
    if (this.c3?.gnafId !== gnafId) {
      if (this.headroomTimer) { clearTimeout(this.headroomTimer); this.headroomTimer = null; }
      this.c3 = { gnafId, el: context3dCard(gnafId, this.opts.context3d, v.resolve.location ?? null, (i) => this.onHeadroom(gnafId, i)) };
    }
    return this.c3.el;
  }

  private pendingVerdict(): HTMLElement {
    return h('div', { class: 'verdict pending', 'aria-hidden': 'true' }, h('div', { class: 'shimmer w30' }), h('div', { class: 'shimmer h2', style: 'margin-top:10px' }), h('div', { class: 'shimmer w55', style: 'margin-top:8px' }));
  }

  /** Agency quoting wins outright; otherwise wait (height reserved) for the 3D headroom finding, then fall back. */
  private exactVerdict(facts: NonNullable<Extract<PanelView, { kind: 'result' }>['facts']>): HTMLElement {
    const slot = h('div', { class: 'verdict-slot' });
    this.verdictSlot = slot;
    const q = quotingVerdict(facts);
    const waiting = !q && !!this.c3 && this.c3.insight === undefined;
    if (waiting && !this.headroomTimer) {
      const gnafId = this.c3!.gnafId;
      this.headroomTimer = setTimeout(() => { this.headroomTimer = null; if (this.c3?.gnafId === gnafId && this.c3.insight === undefined) this.onHeadroom(gnafId, null); }, HEADROOM_WAIT_MS);
    }
    slot.append(waiting ? this.pendingVerdict() : verdictEl(q ?? factsVerdict(facts, this.c3?.insight ?? null)));
    return slot;
  }

  /** The 3D card reported (or timed out): update the verdict in place, no re-render, no layout jump. */
  private onHeadroom(gnafId: string, insight: HeadroomInsight | null): void {
    if (this.c3?.gnafId !== gnafId) return;
    if (insight === null && this.c3.insight) return; // a late timeout never downgrades a real finding
    this.c3.insight = insight;
    const v = this.view;
    if (v?.kind !== 'result' || !v.facts || !this.verdictSlot?.isConnected) return;
    if (quotingVerdict(v.facts)) return;
    this.verdictSlot.replaceChildren(verdictEl(factsVerdict(v.facts, insight)));
    // The verdict now carries the headroom line, so the 3D card drops its own copy of it.
    this.c3.el.classList.toggle('lead-in-verdict', !!headroomVerdict(insight));
  }

  private buildingBlock(v: Extract<PanelView, { kind: 'result' }>): HTMLElement {
    const beds = [1, 2, 3, 4].map((n) => h('button', { type: 'button', 'aria-pressed': String(v.bedrooms === n), onClick: () => this.handlers.onBedrooms(n) }, n === 4 ? '4+' : String(n)));
    return h('section', { class: 'card', 'aria-label': 'Narrow down the unit' },
      h('h3', {}, 'Which unit?', h('span', { class: 'count' }, `${v.resolve.candidates.length} units`)),
      h('div', { class: 'sub' }, 'The listing doesn’t say which unit. How many bedrooms?'),
      h('div', { class: 'beds', role: 'group', 'aria-label': 'Bedrooms' }, ...beds),
      v.resolve.candidates.length ? this.unitList(v.resolve.candidates) : null);
  }

  private unitList(cands: readonly Candidate[]): HTMLElement {
    return h('ul', { class: 'units', 'aria-label': 'Units at this address' }, ...cands.slice(0, 60).map((c) =>
      h('li', {}, h('button', { onClick: () => this.handlers.onPick(c) }, h('span', {}, c.label), h('span', {}, c.bedrooms ? `${c.bedrooms} bed` : '')))));
  }

  private candidateList(title: string, cands: readonly Candidate[]): HTMLElement {
    return h('section', { class: 'card' }, h('h3', {}, title, h('span', { class: 'count' }, `${cands.length} found`)), cands.length ? this.unitList(cands) : h('div', { class: 'sub' }, 'No candidates returned.'));
  }

  private setReceiptOpen(sec: HTMLElement, btn: HTMLElement, open: boolean): void {
    this.receiptOpen = open;
    sec.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    try { sessionStorage.setItem('gt:receipt', open ? '1' : '0'); } catch { /* ignore */ }
  }

  private receipt(ex: Extraction, r: ResolveResponse | null, picked: Candidate | undefined, st: PanelState): HTMLElement {
    const checks = r?.receipt?.checks ?? {};
    const entries = Object.entries(checks);
    const passed = entries.filter(([, ok]) => ok).length;
    const checkEls = entries.map(([k, ok]) => h('span', { class: ok ? 'y' : 'n' }, `${ok ? '✓' : '✗'} ${k}`));
    const gnaf = picked?.gnafId ?? r?.gnafId ?? null;
    const open = this.receiptOpen ?? (st !== 'EXACT' && st !== 'LOADING');
    const idLine = gnaf ?? (picked ? picked.label : r?.receipt?.normalised) ?? ex.raw;
    const meta = r ? `${entries.length ? `${passed}/${entries.length} checks · ` : ''}conf ${Math.round(r.confidence)}` : '';
    const sec = h('section', { class: `receipt ${st}${open ? ' open' : ''}`, 'aria-label': 'Match receipt' });
    const strip = h('button', { class: 'strip', type: 'button', 'aria-expanded': String(open), title: 'Show the full match receipt',
      onClick: () => this.setReceiptOpen(sec, strip, !sec.classList.contains('open')) },
      h('span', { class: 'seal', 'aria-hidden': 'true' }, SEAL[st]),
      h('span', { class: 'who' }, h('b', {}, STRIP_TITLE[st]), h('span', {}, idLine)),
      h('span', { class: 'meta' }, meta),
      h('span', { class: 'chev', 'aria-hidden': 'true' }));
    sec.append(strip, h('div', { class: 'rbody' },
      h('div', { class: 'ttl' }, h('span', {}, 'Match receipt'), h('span', {}, r ? `confidence ${Math.round(r.confidence)}` : '…')),
      h('dl', {},
        h('dt', {}, 'read'), h('dd', {}, ex.raw),
        h('dt', {}, 'from'), h('dd', {}, `${this.opts.siteLabel?.(ex) ?? (ex.source === 'manual' ? 'you' : ex.source === 'rea' ? 'realestate.com.au' : 'domain.com.au')} · ${FROM_LABEL[ex.from] ?? ex.from}`),
        h('dt', {}, 'normalised'), h('dd', {}, picked ? picked.label : r?.receipt?.normalised ?? '…'),
        h('dt', {}, 'g-naf'), h('dd', {}, gnaf ?? '—'),
        checkEls.length ? h('dt', {}, 'checks') : null, checkEls.length ? h('dd', { class: 'checks' }, ...checkEls) : null)));
    return sec;
  }

  private manualForm(prefill: string): HTMLElement {
    const input = h('input', { id: 'gt-manual', type: 'text', value: prefill, autocomplete: 'off', placeholder: '12/45 Crown Street, Surry Hills NSW 2010' });
    queueMicrotask(() => input.focus());
    return h('form', { class: 'manual', onSubmit: (e: Event) => { e.preventDefault(); if (input.value.trim()) this.handlers.onManual(input.value.trim()); } },
      h('label', { for: 'gt-manual' }, 'Address of the home'), input,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Look up'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => this.handlers.onRetry() }, 'Back to listing')));
  }
}
