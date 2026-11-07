import type { Fact } from '../api-types';
import { h } from './dom';
import { parseGuidePrice, pickNumber } from './format';
import { avmFromFact, checkGuide, quotingFromFact, type GuideCheck, type Line } from './offer';

/** The one guide input is shared: cards that react to it register a listener here. */
export interface GuideBus {
  readonly state: { value: string };
  readonly listeners: Array<() => void>;
}

const TITLE = 'Check a guide you were given';
const LABEL = 'Check a guide';

const pill = (l: Line) => h('div', { class: `offer-pill ${l.tone}`, role: 'status' }, l.text);

function paint(slot: HTMLElement, r: GuideCheck): void {
  const sub = r.second?.text ?? r.projection;
  const parts = [
    r.headline.tone === 'none' && r.headline.text.startsWith('Type') ? null : pill(r.headline),
    sub ? h('div', { class: 'offer-detail' }, sub) : null,
  ].filter((x): x is HTMLDivElement => x !== null);
  slot.title = [r.detail, r.evidence, r.projection].filter(Boolean).join(' · ');
  slot.replaceChildren(...parts);
}

export function offerCeilingCard(avmFact: Fact | undefined, quotingFact: Fact | undefined, bus: GuideBus): HTMLElement {
  const avm = avmFromFact(avmFact);
  const quoting = quotingFromFact(quotingFact);
  if (!avm && !quoting) {
    return h('section', { class: 'card offer na', 'aria-label': TITLE }, h('h3', {}, LABEL),
      h('div', { class: 'big' }, 'Not enough data'));
  }
  const slot = h('div', { 'aria-live': 'polite' });
  const asking = quotingFact?.available ? pickNumber(quotingFact.data, ['asking_price']) : null;
  const update = () => paint(slot, checkGuide({ avm, quoting, asking, guide: parseGuidePrice(bus.state.value) }));
  const input = h('input', {
    id: 'gt-guide', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. $850k', value: bus.state.value,
    onInput: (e: Event) => { bus.state.value = (e.target as HTMLInputElement).value; bus.listeners.forEach((fn) => fn()); },
  });
  bus.listeners.push(update);
  update();
  return h('section', { class: 'card offer', 'aria-label': TITLE },
    h('h3', {}, LABEL),
    h('label', { class: 'sub', for: 'gt-guide', title: 'Typed by you. We never read prices from the listing.' }, 'Guide you were quoted'),
    h('div', { class: 'guide-row' }, input),
    slot);
}

export const OFFER_CSS = /* css */ `
.card.offer { background: linear-gradient(180deg, var(--paper-2), var(--paper) 70%); }
.card.offer label.sub { display: block; }
.offer-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 10px; border-radius: 999px; font: 650 11.5px/1.2 var(--sans); background: var(--grey-wash); color: var(--grey); }
.offer-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.offer-pill.ok { background: var(--ok-wash); color: var(--ok); }
.offer-pill.bad { background: var(--bad-wash); color: var(--bad); }
.offer-pill.warn { background: var(--warn-wash); color: var(--warn); }
.offer-pill + .offer-pill { margin-top: 6px; display: flex; width: fit-content; }
.offer-detail { margin-top: 6px; font: 12px/1.45 var(--sans); color: var(--ink-2); }
.offer-note { margin-top: 6px; font: 11.5px/1.45 var(--sans); color: var(--ink-3); font-style: italic; }
.card.offer .big { margin-top: 8px; }
.offer-maths { margin-top: 6px; font: 11px/1.5 var(--mono); color: var(--ink-3); }
`;
