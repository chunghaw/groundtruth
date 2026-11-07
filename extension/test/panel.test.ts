import { Panel } from '../src/content/panel';
import { subjectCaption } from '../src/context3d/card';
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
    expect(t).toContain('13 of 21 sold above guide');
    expect(t).toContain('Guide $900k → $960k');
    expect(t).toContain('(+6.7%)');
    expect(t).toContain('Treat the guide as a floor.');
    expect(q(p, '.cohort-pill')[0].textContent).toBe('Underquoter');
    // AVM drives the price block when there is no agency likely price.
    expect(q(p, '.body > *')[0].classList.contains('price-block')).toBe(true);
    expect(q(p, '.price-block')[0].textContent).toContain('Microburbs value$1m');
    expect(q(p, '.price-block .prow.value')[0].getAttribute('title')).toContain('Model estimate from comparable sales · likely $900k–$1.1m');
    expect(q(p, '.card.alert').length).toBe(1);
    expect(t).toContain('$1m');
    expect(t).toContain('no street row');
    const titles = [...q(p, '.card h3')].map((e) => e.textContent);
    expect(titles.slice(0, 3)).toEqual(['Agency quoting', 'Check a guide', 'Value range']);
    expect(titles.indexOf('Street vs suburb')).toBe(-1); // unavailable: no card, just the quiet line
    expect(q(p, 'details.na-line summary')[0].textContent).toContain('Not available: street');
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'G', facts: {
      streetProfile: { available: true, data: { profile: { title: 'Mock Street', annual_4y: 5.1, renters_pct: '45%' }, suburb_medians: { annual_4y: 4.8, renters_pct: 50 }, forecast_rank: { band: 'Top 15%' } } } } } });
    expect(text(p)).toContain('5.1% · 4.8%');
    expect(text(p)).toContain('45% · 50%');
    expect(text(p)).toContain('Top 15%');
    expect(text(p)).toContain('Not available'); // missing facts render gracefully
    expect(t).toContain('$4,200/yr');
    expect([...q(p, '.card h3')].map((e) => e.textContent)).toEqual(['Street vs suburb']); // no budget without AVM or quoting
    expect(q(p, 'details.na-line')[0].textContent).toContain('agency, value');
  });

  it('moves the 3D card up and upgrades the verdict in place once headroom arrives', async () => {
    const realIO = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = undefined;
    let ready!: (m: any) => void;
    const host = {
      load: vi.fn(async () => ({ gnafId: 'GANSW1', available: true, center: [151.2, -33.9], radiusM: 120, lots: { type: 'FeatureCollection', features: [] }, noise: null, busyRoads: null, subject: null, tallestNeighbour: null, heightSource: 'hob', notes: [] })),
      mount: vi.fn(() => new Promise((r) => { ready = r; })),
    };
    const p = new Panel(handlers(), { context3d: host as any });
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'GANSW1', facts: {
      agentQuoting: { available: false, data: null, reason: 'no active listing' },
      avm: { available: true, data: { predicted_price: 1_000_000, predicted_price_low: 900_000, predicted_price_high: 1_100_000 } },
      risks: { available: true, data: {} },
    } } });
    const order = [...q(p, '.body > *')].map((e) => e.getAttribute('aria-label') ?? e.className.split(' ')[0]);
    expect(order.slice(0, 5)).toEqual(['price-block', 'verdict-slot', 'Match receipt', 'What can rise next door', 'Check a guide you were given']);
    expect(q(p, '.verdict-slot .verdict.pending').length).toBe(1);
    await vi.waitFor(() => expect(host.mount).toHaveBeenCalled());
    const slot = q(p, '.verdict-slot')[0];
    ready({ setOverlay: () => {}, destroy: () => {}, insight: { known: true, nearM: 100, count: 2, minStoreys: 4, maxStoreys: 5, subjectActualM: null,
      biggest: { distanceM: 40, direction: 'N', storeys: 5, maxHeightM: 22, actualM: 6, source: 'hob' } } });
    await vi.waitFor(() => expect(q(p, '.verdict h2')[0]?.textContent).toBe('2 lots within 100 m could rise 4–5 more storeys'));
    expect(q(p, '.verdict-slot')[0]).toBe(slot); // updated in place
    (globalThis as any).IntersectionObserver = realIO;
  });

  it('falls back to the AVM when the 3D view finds no headroom', async () => {
    const realIO = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = undefined;
    const host = { load: vi.fn(async () => ({ gnafId: 'GANSW1', available: false, reason: 'no lots', lots: { features: [] } })), mount: vi.fn() };
    const p = new Panel(handlers(), { context3d: host as any });
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'GANSW1', facts: {
      avm: { available: true, data: { predicted_price: 1_000_000, predicted_price_low: 900_000, predicted_price_high: 1_100_000 } } } } });
    await vi.waitFor(() => expect(q(p, '.verdict h2')[0]?.textContent).toBe('Microburbs values this home at $1m'));
    (globalThis as any).IntersectionObserver = realIO;
  });

  it('BUILDING shows bedroom buttons that call back', () => {
    const hs = handlers();
    const p = new Panel(hs);
    p.render({ kind: 'result', ex, resolve: resolve('BUILDING', { candidates: [{ gnafId: 'g1', label: '901/417 Bourke St', bedrooms: null }] }), facts: null, bedrooms: null });
    const btns = [...q(p, '.beds button')] as HTMLButtonElement[];
    expect(btns.map((b) => b.textContent)).toEqual(['1', '2', '3', '4+']);
    btns[1].click();
    expect(hs.onBedrooms).toHaveBeenCalledWith(2);
    (q(p, '.units button')[0] as HTMLButtonElement).click();
    expect(hs.onPick).toHaveBeenCalled();
  });

  it('BUILDING bedroom chips filter units in place, labels show the unit, level units first', () => {
    const hs = handlers();
    const p = new Panel(hs);
    const candidates = [
      { gnafId: 'a', label: '301/1 Alfred St', bedrooms: 2 },
      { gnafId: 'b', label: '803/1 Alfred St', bedrooms: 2 },
      { gnafId: 'c', label: '804/1 Alfred St', bedrooms: 1 },
    ];
    p.render({ kind: 'result', ex: { ...ex, raw: 'Level 8, 1 Alfred Street, Sydney NSW 2000' }, resolve: resolve('BUILDING', { candidates }), facts: null, bedrooms: null });
    expect([...q(p, '.units button span:first-child')].map((e) => e.textContent)).toEqual(['Unit 803 · 2 bed', 'Unit 804 · 1 bed', 'Unit 301 · 2 bed']);
    expect(q(p, '.card .count')[0]?.textContent).toBe('3 units');
    ([...q(p, '.beds button')][1] as HTMLButtonElement).click();
    expect(hs.onBedrooms).not.toHaveBeenCalled();
    expect(q(p, '.units button').length).toBe(2);
    expect(q(p, '.card .count')[0]?.textContent).toBe('2 of 3 units');
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

  it('leads with a one-line verdict and a collapsible verified-home strip', () => {
    sessionStorage.removeItem('gt:receipt');
    const p = new Panel(handlers());
    p.render({ kind: 'result', ex, resolve: resolve('EXACT'), bedrooms: null, facts: { gnafId: 'GANSW1', facts: {
      agentQuoting: { available: true, data: { agency_name: 'Acme', median_deviation_pct: 6.5, underquote_rate_pct: 40, total_sales: 12 } } } } });
    expect(q(p, '.verdict h2')[0].textContent).toBe('Agency usually sells 6.5% over guide');
    const sec = q(p, 'section.receipt')[0] as HTMLElement;
    expect(sec.classList.contains('open')).toBe(false); // EXACT starts compact
    expect(sec.textContent).toContain('Verified home');
    expect(sec.textContent).toContain('Verified home · 4/4');
    (q(p, 'section.receipt .strip')[0] as HTMLButtonElement).click();
    expect(sec.classList.contains('open')).toBe(true);
    expect(q(p, 'section.receipt dl dd').length).toBeGreaterThanOrEqual(4);
    sessionStorage.removeItem('gt:receipt');
  });

  it('non-EXACT states open the receipt and explain themselves', () => {
    sessionStorage.removeItem('gt:receipt');
    const p = new Panel(handlers());
    p.render({ kind: 'result', ex, resolve: resolve('NO_MATCH', { message: 'No home matched' }), facts: null, bedrooms: null });
    expect((q(p, 'section.receipt')[0] as HTMLElement).classList.contains('open')).toBe(true);
    expect(q(p, '.verdict')[0].getAttribute('title')).toContain('No home matched');
  });

  it('3D caption never promises "up to 3 m" for an older tower', () => {
    const d = { subject: { maxHeightM: 3, storeys: 1, source: 'hob' } } as any;
    expect(subjectCaption(d, 63)).toBe("Your building predates today's height control (≈63 m, above today's 3 m limit)");
    expect(subjectCaption(d, 63)).not.toContain('up to 3 m');
  });
});
