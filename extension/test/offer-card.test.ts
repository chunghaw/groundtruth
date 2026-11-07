import { factCards } from '../src/content/cards';

const facts = (aq: any, avm: any) => ({ gnafId: 'G', facts: {
  agentQuoting: aq === null ? { available: false, data: null, reason: 'not listed' } : { available: true, data: aq },
  avm: avm === null ? { available: false, data: null } : { available: true, data: avm },
} });
const AVM = { predicted_price: 1_000_000, predicted_price_low: 900_000, predicted_price_high: 1_100_000 };
const AQ = { agency_name: 'Acme', median_deviation_pct: 6.5, underquote_rate_pct: 40, total_sales: 12 };

function mountCards(f: any, guide = { value: '' }) {
  const host = document.createElement('div');
  host.append(...factCards(f, guide));
  document.body.append(host);
  return host;
}

describe('offer ceiling card', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('sits right after the agency card and owns the single guide input', () => {
    const host = mountCards(facts(AQ, AVM));
    const titles = [...host.querySelectorAll('section > h3')].map((e) => e.textContent);
    expect(titles.slice(0, 3)).toEqual(['Agency quoting accuracy', 'Realistic budget', 'Microburbs value']);
    expect(host.querySelectorAll('input').length).toBe(1);
  });

  it('updates the verdict, budget and the AVM bar as the buyer types', () => {
    const guide = { value: '' };
    const host = mountCards(facts(AQ, AVM), guide);
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = '$950k';
    input.dispatchEvent(new Event('input'));
    expect(guide.value).toBe('$950k');
    const card = host.querySelector('.card.offer')!;
    expect(card.querySelector('.offer-pill')?.textContent).toBe('Guide likely low — expect ~+7%');
    expect(card.querySelector('.big')?.textContent).toBe('$1.01m');
    expect(card.textContent).toContain('× (1 + 6.5%');
    expect(host.querySelector('.range .guide')).not.toBeNull();
  });

  it('works AVM-only and hides itself with neither', () => {
    const host = mountCards(facts(null, AVM), { value: '1.2m' });
    expect(host.querySelector('.offer-pill')?.textContent).toBe('Guide above our range');
    document.body.innerHTML = '';
    const none = mountCards(facts(null, null), { value: '' });
    expect(none.querySelector('.card.offer')).toBeNull(); // hidden, not a dead card
  });
});
