import { Panel } from '../src/content/panel';
import type { ResolveResponse } from '../src/api-types';

const ex = { source: 'rea' as const, listingId: '1', raw: '902/417-419 Bourke Street, Surry Hills, NSW 2010', parts: null, from: 'h1' as const };
const resolve = (state: ResolveResponse['state'], extra: Partial<ResolveResponse> = {}): ResolveResponse => ({
  state, confidence: 90, gnafId: state === 'EXACT' ? 'GANSW1' : null,
  receipt: { read: ex.raw, normalised: 'U902 · 417-419 · BOURKE ST · SURRY HILLS', checks: { unit: true, number: true, street: true, suburb: state === 'EXACT' } },
  candidates: [], ...extra,
});
const handlers = () => ({ onBedrooms: vi.fn(), onPick: vi.fn(), onManual: vi.fn(), onRetry: vi.fn() });
const text = (p: Panel) => ((p as any).root as ShadowRoot).textContent ?? '';
const q = (p: Panel, sel: string) => ((p as any).root as ShadowRoot).querySelectorAll(sel);

describe('Panel', () => {
  afterEach(() => document.querySelectorAll('groundtruth-panel').forEach((e) => e.remove()));

  it('renders EXACT with facts in order and handles unavailable facts', () => {
    const p = new Panel(handlers());
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'GANSW1', facts: {
      agentQuoting: { available: true, data: { agency_name: 'Acme', cohort: 'Underquoter', underquote_rate_pct: 62, total_sales: 21, recent_sales: [{ guide_price: 900000, sold_price: 960000, diff_pct: 6.7 }] } },
      avm: { available: true, data: { predicted_price: 1_000_000, predicted_price_low: 900_000, predicted_price_high: 1_100_000 } },
      saleHistory: { available: true, data: [{ date: '2019-03-01', price: 800000, type: 'Sold' }] },
      streetProfile: { available: false, data: null, reason: 'no street row' },
      risks: { available: true, data: { flood: [{ name: 'Flood', on_property: false, value: 'Not on property' }] } },
      strataLevy: { available: true, data: { median_levy_annual: 4200 } },
      basics: { available: true, data: { bed_count: 2 } },
    } } });
    const t = text(p);
    expect(t).toContain('Exact');
    expect(t).toContain('GANSW1');
    expect(t).toContain('62% of sales beat the guide');
    expect(t).toContain('+6.7%');
    expect(q(p, '.card.alert').length).toBe(1);
    expect(t).toContain('$1m');
    expect(t).toContain('no street row');
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'G', facts: {
      streetProfile: { available: true, data: { profile: { title: 'Mock Street', annual_4y: 5.1, renters_pct: '45%' }, suburb_medians: { annual_4y: 4.8, renters_pct: 50 }, forecast_rank: { band: 'Top 15%' } } } } } });
    expect(text(p)).toContain('5.1% · 4.8%');
    expect(text(p)).toContain('45% · 50%');
    expect(text(p)).toContain('Top 15%');
    expect(text(p)).toContain('Not available'); // missing facts render gracefully
    expect(t).toContain('$4,200/yr');
    const titles = [...q(p, '.card h3')].map((e) => e.textContent);
    expect(titles[0]).toBe('Agency quoting accuracy');
    expect(titles[1]).toBe('Microburbs value');
  });

  it('BUILDING shows bedroom buttons that call back', () => {
    const hs = handlers();
    const p = new Panel(hs);
    p.render({ kind: 'result', ex, resolve: resolve('BUILDING', { candidates: [{ gnafId: 'g1', label: '901/417 Bourke St', bedrooms: 2 }] }), facts: null, bedrooms: null });
    const btns = [...q(p, '.beds button')] as HTMLButtonElement[];
    expect(btns.map((b) => b.textContent)).toEqual(['1', '2', '3', '4+']);
    btns[1].click();
    expect(hs.onBedrooms).toHaveBeenCalledWith(2);
    (q(p, '.units button')[0] as HTMLButtonElement).click();
    expect(hs.onPick).toHaveBeenCalled();
  });

  it('error state offers retry and manual entry (no endless spinner)', () => {
    const hs = handlers();
    const p = new Panel(hs);
    p.render({ kind: 'error', ex, message: 'Groundtruth proxy unreachable at http://localhost:3000' });
    expect(text(p)).toContain('unreachable');
    expect(q(p, '.shimmer').length).toBe(0);
    (q(p, '.btn')[0] as HTMLButtonElement).click();
    expect(hs.onRetry).toHaveBeenCalled();
  });

  it('Wrong home? opens manual form which submits typed text', () => {
    const hs = handlers();
    const p = new Panel(hs);
    p.render({ kind: 'result', ex, resolve: resolve('NO_MATCH', { message: 'No home matched' }), facts: null, bedrooms: null });
    (q(p, '.link')[0] as HTMLButtonElement).click();
    const input = q(p, '#gt-manual')[0] as HTMLInputElement;
    input.value = '1 Crown St, Surry Hills NSW 2010';
    (q(p, 'form')[0] as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    expect(hs.onManual).toHaveBeenCalledWith('1 Crown St, Surry Hills NSW 2010');
  });

  it('remounts if the page removes it', () => {
    const p = new Panel(handlers());
    document.querySelector('groundtruth-panel')!.remove();
    p.mount();
    expect(document.querySelector('groundtruth-panel')).not.toBeNull();
  });
});
