import type { Fact } from '../api-types';
import { h } from './dom';
import { money, parseGuidePrice } from './format';
import { avmFromFact, offerCeiling, quotingFromFact, type OfferResult } from './offer';

/** The one guide input is shared: cards that react to it register a listener here. */
export interface GuideBus {
  readonly state: { value: string };
  readonly listeners: Array<() => void>;
}

const TITLE = 'Realistic budget';

function paint(slot: HTMLElement, r: OfferResult): void {
  const parts = [
    h('div', { class: `offer-pill ${r.verdict}`, role: 'status' }, r.label),
    r.budget !== null ? h('div', { class: 'big' }, money(r.budget)) : null,
    h('div', { class: 'offer-maths' }, r.maths),
  ].filter((x): x is HTMLDivElement => x !== null);
  slot.replaceChildren(...parts);
}

export function offerCeilingCard(avmFact: Fact | undefined, quotingFact: Fact | undefined, bus: GuideBus): HTMLElement {
  const avm = avmFromFact(avmFact);
  const quoting = quotingFromFact(quotingFact);
  if (!avm && !quoting) {
    return h('section', { class: 'card offer na', 'aria-label': TITLE }, h('h3', {}, TITLE),
      h('div', { class: 'big' }, 'Not enough data: no Microburbs value or agency track record for this home.'));
  }
  const slot = h('div', { 'aria-live': 'polite' });
  const update = () => paint(slot, offerCeiling({ avm, quoting, guide: parseGuidePrice(bus.state.value) }));
  const input = h('input', {
    id: 'gt-guide', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. $1.1m or 1.05m – 1.15m', value: bus.state.value,
    onInput: (e: Event) => { bus.state.value = (e.target as HTMLInputElement).value; bus.listeners.forEach((fn) => fn()); },
  });
  bus.listeners.push(update);
  update();
  return h('section', { class: 'card offer', 'aria-label': TITLE },
    h('h3', {}, TITLE),
    h('label', { class: 'sub', for: 'gt-guide' }, 'Guide price you were given (typed by you, never read from the page):'),
    h('div', { class: 'guide-row' }, input),
    slot);
}

export const OFFER_CSS = /* css */ `
.card.offer { background: linear-gradient(180deg, var(--paper-2), var(--paper) 70%); }
.card.offer label.sub { display: block; }
.offer-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; padding: 6px 10px; border-radius: 999px; font: 650 11.5px/1.2 var(--sans); background: var(--grey-wash); color: var(--grey); }
.offer-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.offer-pill.believable { background: var(--ok-wash); color: var(--ok); }
.offer-pill.low { background: var(--bad-wash); color: var(--bad); }
.offer-pill.above { background: var(--warn-wash); color: var(--warn); }
.card.offer .big { margin-top: 8px; }
.offer-maths { margin-top: 6px; font: 11px/1.5 var(--mono); color: var(--ink-3); }
`;
