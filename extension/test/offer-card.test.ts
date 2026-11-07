import { factCards } from '../src/content/cards';

const facts = (aq: any, avm: any) => ({ gnafId: 'G', facts: {
  agentQuoting: aq === null ? { available: false, data: null, reason: 'not listed' } : { available: true, data: aq },
  avm: avm === null ? { available: false, data: null } : { available: true, data: avm },
} });
const AVM = { predicted_price: 785_000, predicted_price_low: 612_000, predicted_price_high: 958_000 };
const AQ = { agency_name: 'Acme', median_deviation_pct: 3.9, underquote_rate_pct: 60, total_sales: 10, asking_price: 800_000 };
const TITLE = 'Check a guide you were given';

function mountCards(f: any, guide = { value: '' }) {
  const host = document.createElement('div');
  host.append(...factCards(f, guide));
  document.body.append(host);
  return host;
}

describe('guide check card', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('sits right after the agency card and owns the single guide input', () => {
    const host = mountCards(facts(AQ, AVM));
    const titles = [...host.querySelectorAll('section > h3')].map((e) => e.textContent);
    expect(titles.slice(0, 3)).toEqual(['Agency quoting accuracy', TITLE, 'Microburbs value range']);
    expect(host.querySelectorAll('input').length).toBe(1);
    expect(host.querySelector('.card.offer label')?.textContent).toBe('Guide the agent told you (typed by you — we never read prices from the listing)');
  });

  it('Belvoir St: $900k typed differs from the $800k on record and is 15% above the estimate', async () => {
    const guide = { value: '' };
    const host = mountCards(facts(AQ, AVM), guide);
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = '$900k';
    input.dispatchEvent(new Event('input'));
    await Promise.resolve();
    expect(guide.value).toBe('$900k');
    const card = host.querySelector('.card.offer')!;
    const pills = [...card.querySelectorAll('.offer-pill')].map((e) => e.textContent);
    expect(pills).toEqual(['Differs from the guide on record ($800k)', 'Inside the range, but 15% above Microburbs’ estimate of $785k']);
    expect(card.textContent).not.toContain('believable');
    expect(card.textContent).toContain('Microburbs estimate $785k (likely range $612k–$958k)');
    expect(card.textContent).toContain('expect about $935k');
    expect(host.querySelector('.range .guide')).not.toBeNull();
    expect(host.querySelector('.guide-verdict')?.textContent).toBe('Your $900k is 15% above the estimate, inside the likely range');
  });

  it('works AVM-only and hides itself with neither', () => {
    const host = mountCards(facts(null, AVM), { value: '1.1m' });
    expect(host.querySelector('.offer-pill')?.textContent).toBe('Well above Microburbs’ estimate');
    expect(host.querySelector('.offer-pill')?.className).toContain('bad');
    document.body.innerHTML = '';
    const none = mountCards(facts(null, null), { value: '' });
    expect(none.querySelector('.card.offer')).toBeNull();
  });
});
