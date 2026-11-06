import type { Candidate, FactsResponse, MatchState, ResolveResponse } from '../api-types';
import type { Extraction } from '../extract/types';
import { factCards } from './cards';
import { h } from './dom';
import { PANEL_CSS } from './styles';
import { BriefingControl, BRIEFING_CSS, type BriefingDeps } from './briefing';
import { OFFER_CSS } from './offerCard';
import { context3dCard, CONTEXT3D_CSS } from '../context3d/card';
import type { Context3DHost } from '../context3d/types';

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

const STATE_LABEL: Record<MatchState | 'LOADING' | 'ERROR', string> = {
  EXACT: 'Exact', BUILDING: 'Building', CHOOSE: 'Choose', NO_MATCH: 'No match', OUT_OF_AREA: 'Out of area', LOADING: 'Reading', ERROR: 'Offline',
};
const DOT: Record<string, string> = { EXACT: '#1f7a4d', BUILDING: '#a96500', CHOOSE: '#2c79b5', NO_MATCH: '#b4232c', OUT_OF_AREA: '#8a93a2', LOADING: '#8a93a2', ERROR: '#b4232c' };
const FROM_LABEL: Record<string, string> = { h1: 'page heading', 'h1+json-ld': 'heading ✓ structured data', __NEXT_DATA__: 'page data (id-matched)', manual: 'typed by you' };

export class Panel {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly wrap: HTMLElement;
  private collapsed = false;
  private view: PanelView | null = null;
  private guide = { value: '' };
  private readonly briefing: BriefingControl | null;
  private c3: { gnafId: string; el: HTMLElement } | null = null;

  constructor(private readonly handlers: PanelHandlers, private readonly opts: PanelOptions = {}) {
    this.host = document.createElement('groundtruth-panel');
    this.root = this.host.attachShadow({ mode: 'closed' });
    this.root.append(h('style', {}, PANEL_CSS));
    this.root.append(h('style', {}, OFFER_CSS + BRIEFING_CSS));
    this.briefing = opts.briefing ? new BriefingControl(opts.briefing) : null;
    this.root.append(h('style', {}, CONTEXT3D_CSS));
    this.wrap = h('div', { class: 'gt' });
    this.root.append(this.wrap);
    try { this.collapsed = sessionStorage.getItem('gt:collapsed') === '1'; } catch { /* storage blocked */ }
    this.mount();
  }

  /** Re-attach if the host page re-renders and drops us. */
  mount(): void {
    if (!this.host.isConnected) (this.opts.container ?? document.documentElement).append(this.host);
  }

  destroy(): void { this.briefing?.stop(); this.host.remove(); }

  resetGuide(): void { this.guide = { value: '' }; }

  render(view: PanelView): void {
    this.view = view;
    this.mount();
    const state = this.stateOf(view);
    this.wrap.className = `gt${this.opts.container ? ' embedded' : ''}${this.collapsed ? ' collapsed' : ''}`;
    const tab = h('button', { class: 'tab', 'aria-expanded': String(!this.collapsed), 'aria-label': `Groundtruth: ${STATE_LABEL[state]}. ${this.collapsed ? 'Expand' : 'Collapse'} panel`, onClick: () => this.toggle() },
      h('span', { class: 'dot', style: `background:${DOT[state]}` }), 'Groundtruth');
    const sheet = h('aside', { class: 'sheet', 'aria-label': 'Groundtruth property facts' },
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, 'Groundtruth', h('small', {}, 'Microburbs facts')),
        h('div', { class: 'spacer' }),
        this.briefingButton(view),
        h('span', { class: `pill ${state}` }, STATE_LABEL[state]),
        h('button', { class: 'icon-btn', 'aria-label': 'Collapse panel', onClick: () => this.toggle() }, '›')),
      h('div', { class: 'body' }, this.briefing && this.briefingGnaf(view) ? this.briefing.captions() : null, ...this.bodyFor(view)));
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

  private stateOf(v: PanelView): MatchState | 'LOADING' | 'ERROR' {
    if (v.kind === 'loading' || v.kind === 'manual') return 'LOADING';
    if (v.kind === 'error') return 'ERROR';
    return v.picked ? 'EXACT' : v.resolve.state;
  }

  private bodyFor(v: PanelView): HTMLElement[] {
    switch (v.kind) {
      case 'loading':
        return [this.receipt(v.ex, null), h('div', { class: 'loading', 'aria-busy': 'true', 'aria-label': 'Looking up this home' }, h('div', { class: 'shimmer' }), h('div', { class: 'shimmer' }))];
      case 'error':
        return [v.ex ? this.receipt(v.ex, null) : null,
          h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Can’t reach Groundtruth'), v.message),
          h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => this.handlers.onRetry() }, 'Try again'),
            h('button', { class: 'btn ghost', onClick: () => this.render({ kind: 'manual', prefill: v.ex?.raw ?? '' }) }, 'Type address'))].filter(Boolean) as HTMLElement[];
      case 'manual':
        return [this.manualForm(v.prefill)];
      case 'result':
        return this.resultBody(v);
    }
  }

  private wrongHome(ex: Extraction): HTMLElement {
    return h('div', { class: 'msg' }, h('button', { class: 'link', onClick: () => this.render({ kind: 'manual', prefill: ex.raw }) }, 'Wrong home?'), ' Type the address yourself.');
  }

  private resultBody(v: Extract<PanelView, { kind: 'result' }>): HTMLElement[] {
    const out: HTMLElement[] = [this.receipt(v.ex, v.resolve, v.picked)];
    const st = v.picked ? 'EXACT' : v.resolve.state;
    if (st !== 'EXACT' && v.resolve.message) out.push(h('div', { class: 'msg' }, v.resolve.message));
    if (st === 'BUILDING') out.push(this.buildingBlock(v));
    if (st === 'CHOOSE') out.push(this.candidateList('Which home is it?', v.resolve.candidates));
    if (st === 'OUT_OF_AREA') out.push(h('div', { class: 'card na' }, h('h3', {}, 'Outside the pilot area'), h('div', { class: 'big' }, 'Groundtruth covers the 29 City of Sydney suburbs for now.')));
    if (st === 'EXACT') {
      if (v.factsPending) out.push(h('div', { class: 'loading', 'aria-busy': 'true' }, h('div', { class: 'shimmer' }), h('div', { class: 'shimmer' })));
      else if (v.facts) out.push(...factCards(v.facts, this.guide));
      else out.push(h('div', { class: 'err', role: 'alert' }, h('b', {}, 'Facts unavailable'), v.factsError ?? 'The proxy did not return facts.',
        h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn', onClick: () => this.handlers.onRetry() }, 'Try again'))));
    }
    const c3 = this.context3d(v);
    if (c3) out.push(c3);
    out.push(this.wrongHome(v.ex));
    out.push(h('div', { class: 'foot' }, 'Only the address was read from this page. Data: Microburbs, G-NAF.'));
    return out;
  }

  /** 3D card for EXACT (the home) or BUILDING (any unit shares the lot). Reused across re-renders so the map survives. */
  private context3d(v: Extract<PanelView, { kind: 'result' }>): HTMLElement | null {
    const st = v.picked ? 'EXACT' : v.resolve.state;
    if (!this.opts.context3d || (st !== 'EXACT' && st !== 'BUILDING')) return null;
    const gnafId = v.picked?.gnafId ?? v.resolve.gnafId ?? v.resolve.candidates[0]?.gnafId ?? null;
    if (!gnafId) return null;
    if (this.c3?.gnafId !== gnafId) this.c3 = { gnafId, el: context3dCard(gnafId, this.opts.context3d) };
    return this.c3.el;
  }

  private buildingBlock(v: Extract<PanelView, { kind: 'result' }>): HTMLElement {
    const beds = [1, 2, 3, 4].map((n) => h('button', { class: 'btn ghost', 'aria-pressed': String(v.bedrooms === n), onClick: () => this.handlers.onBedrooms(n) }, n === 4 ? '4+' : String(n)));
    return h('section', { class: 'card', 'aria-label': 'Narrow down the unit' },
      h('h3', {}, 'Which unit?'),
      h('div', { class: 'sub' }, 'The listing doesn’t say which unit. How many bedrooms?'),
      h('div', { class: 'beds', role: 'group', 'aria-label': 'Bedrooms' }, ...beds),
      v.resolve.candidates.length ? this.unitList(v.resolve.candidates) : null);
  }

  private unitList(cands: readonly Candidate[]): HTMLElement {
    return h('ul', { class: 'units', 'aria-label': 'Units at this address' }, ...cands.slice(0, 60).map((c) =>
      h('li', {}, h('button', { onClick: () => this.handlers.onPick(c) }, h('span', {}, c.label), h('span', {}, c.bedrooms ? `${c.bedrooms} bed` : '')))));
  }

  private candidateList(title: string, cands: readonly Candidate[]): HTMLElement {
    return h('section', { class: 'card' }, h('h3', {}, title), cands.length ? this.unitList(cands) : h('div', { class: 'sub' }, 'No candidates returned.'));
  }

  private receipt(ex: Extraction, r: ResolveResponse | null, picked?: Candidate): HTMLElement {
    const checks = r?.receipt?.checks ?? {};
    const checkEls = Object.entries(checks).map(([k, ok]) => h('span', { class: ok ? 'y' : 'n' }, `${ok ? '✓' : '✗'} ${k}`));
    const gnaf = picked?.gnafId ?? r?.gnafId ?? null;
    return h('section', { class: 'receipt', 'aria-label': 'Match receipt' },
      h('div', { class: 'ttl' }, h('span', {}, 'Match receipt'), h('span', {}, r ? `conf ${Math.round(r.confidence)}` : '…')),
      h('dl', {},
        h('dt', {}, 'read'), h('dd', {}, ex.raw),
        h('dt', {}, 'from'), h('dd', {}, `${this.opts.siteLabel?.(ex) ?? (ex.source === 'manual' ? 'you' : ex.source === 'rea' ? 'realestate.com.au' : 'domain.com.au')} · ${FROM_LABEL[ex.from] ?? ex.from}`),
        h('dt', {}, 'normalised'), h('dd', {}, picked ? picked.label : r?.receipt?.normalised ?? '…'),
        h('dt', {}, 'g-naf'), h('dd', {}, gnaf ?? '—'),
        checkEls.length ? h('dt', {}, 'checks') : null, checkEls.length ? h('dd', { class: 'checks' }, ...checkEls) : null));
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
