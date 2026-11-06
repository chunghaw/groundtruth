import { Panel } from '../src/content/panel';
import type { ResolveResponse } from '../src/api-types';
import { context3dCard, neighbourCaption, subjectCaption } from '../src/context3d/card';
import { fetchContext3D, configureContext3DProxy } from '../src/context3d/api';
import type { Context3D, Context3DHost, MapController } from '../src/context3d/types';

const lot = (isSubject: boolean, maxHeightM: number | null, source: 'hob' | 'fsr-estimate' | 'none' = 'hob') => ({
  type: 'Feature' as const, geometry: { type: 'Polygon', coordinates: [[[151.2, -33.88], [151.2001, -33.88], [151.2001, -33.8801], [151.2, -33.88]]] },
  properties: { gnafId: isSubject ? 'GANSW1' : 'GANSW2', isSubject, maxHeightM, source, fsr: null, storeys: maxHeightM ? Math.round(maxHeightM / 3.2) : null },
});
const DATA: Context3D = {
  gnafId: 'GANSW1', available: true, center: [151.2, -33.88], radiusM: 200,
  lots: { type: 'FeatureCollection', features: [lot(true, 12), lot(false, 45), lot(false, 19.2, 'fsr-estimate')] },
  noise: { type: 'FeatureCollection', features: [] }, busyRoads: null,
  subject: { maxHeightM: 12, storeys: 4, source: 'hob' },
  tallestNeighbour: { gnafId: 'GANSW2', maxHeightM: 45, storeys: 14, source: 'hob', distanceM: 58, direction: 'west' },
  heightSource: 'mixed', notes: [],
};
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeHost(data: Context3D | Error = DATA) {
  const ctl: MapController = { setOverlay: vi.fn(), destroy: vi.fn() };
  const host: Context3DHost = {
    load: vi.fn(async () => { if (data instanceof Error) throw data; return data; }),
    mount: vi.fn(async () => ctl),
  };
  return { host, ctl };
}

describe('captions', () => {
  it('pitches the tallest neighbour and the home itself', () => {
    expect(neighbourCaption(DATA.tallestNeighbour)).toBe('Lot 58 m west: up to 45 m (≈14 storeys)');
    expect(subjectCaption(DATA)).toBe('Your lot: up to 12 m (≈4 storeys)');
    expect(neighbourCaption({ ...DATA.tallestNeighbour!, maxHeightM: 19.2, storeys: 6, source: 'fsr-estimate' })).toBe('Lot 58 m west: up to 19.2 m (≈6 storeys), estimated from FSR');
    expect(neighbourCaption(null)).toBeNull();
  });
});

describe('context3dCard', () => {
  const realIO = (globalThis as any).IntersectionObserver;
  afterEach(() => { (globalThis as any).IntersectionObserver = realIO; });

  it('waits until visible before loading data or the map', async () => {
    let fire: (v: boolean) => void = () => {};
    (globalThis as any).IntersectionObserver = class { constructor(cb: any) { fire = (v) => cb([{ isIntersecting: v }]); } observe() {} disconnect() {} };
    const { host } = fakeHost();
    const el = context3dCard('GANSW1', host);
    document.body.append(el);
    await flush();
    expect(host.load).not.toHaveBeenCalled();
    fire(true);
    await flush();
    expect(host.load).toHaveBeenCalledWith('GANSW1');
    expect(host.mount).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Lot 58 m west: up to 45 m (≈14 storeys)');
    expect(el.textContent).toContain('faded = estimated from FSR');
    el.remove();
  });

  it('toggles overlays on the map controller', async () => {
    (globalThis as any).IntersectionObserver = undefined;
    const { host, ctl } = fakeHost();
    const el = context3dCard('GANSW1', host);
    await flush(); await flush();
    const chip = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Noise')!;
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Busy roads')).toBe(false); // no layer, no chip
    chip.click();
    expect(ctl.setOverlay).toHaveBeenCalledWith('noise', true);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows an honest message on failure, without a map', async () => {
    (globalThis as any).IntersectionObserver = undefined;
    const { host } = fakeHost(new Error('Proxy returned HTTP 500'));
    const el = context3dCard('GANSW1', host);
    await flush(); await flush();
    expect(el.textContent).toContain('Neighbourhood heights unavailable: Proxy returned HTTP 500');
    expect(host.mount).not.toHaveBeenCalled();
    expect(el.querySelector('.c3-stage')).toBeNull();
  });
});

describe('Panel integration', () => {
  const ex = { source: 'rea' as const, listingId: '1', raw: '10 Foster St, Surry Hills NSW 2010', parts: null, from: 'h1' as const };
  const res = (state: ResolveResponse['state'], gnafId: string | null, candidates: ResolveResponse['candidates'] = []): ResolveResponse =>
    ({ state, confidence: 90, gnafId, receipt: { read: ex.raw, normalised: 'x', checks: {} }, candidates });
  const h = () => ({ onBedrooms: vi.fn(), onPick: vi.fn(), onManual: vi.fn(), onRetry: vi.fn() });
  const cards = (p: Panel) => ((p as any).root as ShadowRoot).querySelectorAll('.c3');
  afterEach(() => document.querySelectorAll('groundtruth-panel').forEach((e) => e.remove()));

  it('adds the card for EXACT and BUILDING only, and keeps the same element across re-renders', () => {
    (globalThis as any).IntersectionObserver = class { observe() {} disconnect() {} };
    const { host } = fakeHost();
    const p = new Panel(h(), { context3d: host });
    p.render({ kind: 'result', ex, resolve: res('EXACT', 'GANSW1'), facts: { gnafId: 'GANSW1', facts: {} }, bedrooms: null });
    const first = cards(p)[0];
    expect(first).toBeTruthy();
    p.render({ kind: 'result', ex, resolve: res('EXACT', 'GANSW1'), facts: { gnafId: 'GANSW1', facts: {} }, bedrooms: null });
    expect(cards(p)[0]).toBe(first);
    p.render({ kind: 'result', ex, resolve: res('BUILDING', null, [{ gnafId: 'GANSW9', label: '1/10', bedrooms: null }]), facts: null, bedrooms: null });
    expect(cards(p)).toHaveLength(1);
    p.render({ kind: 'result', ex, resolve: res('NO_MATCH', null), facts: null, bedrooms: null });
    expect(cards(p)).toHaveLength(0);
    const plain = new Panel(h());
    plain.render({ kind: 'result', ex, resolve: res('EXACT', 'GANSW1'), facts: { gnafId: 'GANSW1', facts: {} }, bedrooms: null });
    expect(cards(plain)).toHaveLength(0);
  });
});

describe('fetchContext3D', () => {
  it('calls the proxy with the client token and validates the body', async () => {
    configureContext3DProxy({ proxyBase: 'http://x/', clientToken: 'tok' });
    const f = vi.fn(async () => new Response(JSON.stringify(DATA), { status: 200 }));
    await expect(fetchContext3D('GANSW1', f as any)).resolves.toMatchObject({ gnafId: 'GANSW1' });
    expect((f.mock.calls[0] as any)[0]).toBe('http://x/api/context3d/GANSW1');
    expect((f.mock.calls[0] as any)[1].headers).toEqual({ 'X-Groundtruth-Client': 'tok' });
    await expect(fetchContext3D('GANSW1', (async () => new Response('{}', { status: 200 })) as any)).rejects.toThrow(/malformed/);
    await expect(fetchContext3D('GANSW1', (async () => new Response('', { status: 401 })) as any)).rejects.toThrow(/401/);
  });
});
