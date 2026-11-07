import { Panel } from '../src/content/panel';
import type { ResolveResponse } from '../src/api-types';
import { context3dCard, headroomCaption, neighbourCaption, subjectCaption } from '../src/context3d/card';
import { buildingsFrom, compass, computeHeadroom } from '../src/context3d/headroom';
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

describe('headroom', () => {
  // Lots ~11 m wide along a street running east from the home at [151.2, -33.88].
  const dx = 0.00012;
  const sqr = (i: number): number[][] => [[151.2 + i * dx, -33.88], [151.2 + (i + 1) * dx, -33.88], [151.2 + (i + 1) * dx, -33.8801], [151.2 + i * dx, -33.8801], [151.2 + i * dx, -33.88]];
  const lotAt = (i: number, isSubject: boolean, maxHeightM: number | null) => ({ type: 'Feature' as const, geometry: { type: 'Polygon', coordinates: [sqr(i)] }, properties: { gnafId: `G${i}`, isSubject, maxHeightM, source: 'hob' as const, fsr: null, storeys: null } });
  const data: Context3D = { ...DATA, center: [151.2 + dx / 2, -33.88005], subject: { maxHeightM: 12, storeys: 4, source: 'hob' }, lots: { type: 'FeatureCollection', features: [lotAt(0, true, 12), lotAt(1, false, 30), lotAt(2, false, 12), lotAt(3, false, 30), lotAt(4, false, 45)] } };
  const bld = (i: number, h: number) => ({ geometry: { type: 'Polygon', coordinates: [sqr(i).map(([x, y]) => [x + dx * 0.1 * (x > 151.2 + i * dx ? -1 : 1), y])] }, properties: { render_height: h, render_min_height: 0 } });

  it('ghosts only lots with >= 2 storeys of room above today, and summarises the nearest 100 m', () => {
    const r = computeHeadroom(data, buildingsFrom([bld(0, 6), bld(1, 10), bld(2, 9), bld(3, 28)]));
    expect(r.insight.known).toBe(true);
    expect(r.subjectBuilding?.height).toBe(6);
    expect(r.insight.subjectActualM).toBe(6);
    // lot1: 30-10 = 20 m -> 6 storeys; lot2: 3 m (no); lot3: 2 m (no); lot4: no building -> not guessed
    expect(r.ghosts.features.map((f) => [f.properties.base, f.properties.top, f.properties.headroomStoreys])).toEqual([[10, 30, 6]]);
    expect(r.insight).toMatchObject({ count: 1, maxStoreys: 6, biggest: { direction: 'east', storeys: 6, actualM: 10, maxHeightM: 30 } });
    expect(headroomCaption(r.insight)).toEqual({ lead: '1 lot within 100 m could rise ~6 more storeys', detail: expect.stringContaining('Biggest: 11 m east, +6 storeys (≈10 m today → 30 m allowed)') });
  });

  it('falls back to full envelopes (and no headroom caption) when no building heights are known', () => {
    const r = computeHeadroom(data, []);
    expect(r.insight.known).toBe(false);
    expect(r.ghosts.features.map((f) => [f.properties.base, f.properties.top, f.properties.measured])).toEqual([[0, 30, false], [0, 30, false], [0, 45, false]]);
    expect(headroomCaption(r.insight)).toBeNull();
  });

  it('ignores hidden or heightless building parts; compass and empty captions', () => {
    expect(buildingsFrom([{ geometry: { type: 'Polygon', coordinates: [sqr(0)] }, properties: { render_height: 9, hide_3d: true } }, { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { render_height: 9 } }])).toEqual([]);
    expect(compass(-1, 1)).toBe('north-west');
    expect(headroomCaption({ known: true, nearM: 100, count: 0, minStoreys: 0, maxStoreys: 0, biggest: null, subjectActualM: null })?.lead).toMatch(/^Nothing within 100 m/);
    expect(headroomCaption({ known: true, nearM: 100, count: 3, minStoreys: 2, maxStoreys: 9, biggest: { distanceM: 64, direction: 'north-west', storeys: 9, maxHeightM: 45, actualM: 16, source: 'hob' }, subjectActualM: 7 })?.lead).toBe('3 lots within 100 m could rise 2–9 more storeys');
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
    expect(host.load).toHaveBeenCalledWith('GANSW1', null);
    expect(host.mount).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Lot 58 m west: up to 45 m (≈14 storeys)');
    expect(el.textContent).toContain('Some estimated');
    el.remove();
  });

  it('says the 3D view is unavailable when the map has not rendered within 12 s (no endless spinner)', async () => {
    (globalThis as any).IntersectionObserver = undefined;
    vi.useFakeTimers();
    try {
      const { host } = fakeHost();
      (host as any).mount = vi.fn(() => new Promise(() => {}));
      const el = context3dCard('GANSW1', host);
      await vi.advanceTimersByTimeAsync(0);
      expect(el.querySelector('.c3-stage')?.classList.contains('loading')).toBe(true);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(el.querySelector('.c3-stage')?.classList.contains('loading')).toBe(false);
      expect(el.textContent).toContain('3D view unavailable on this page right now');
      expect(el.textContent).toContain('Lot 58 m west');
    } finally { vi.useRealTimers(); }
  });

  it('replaces a mounted map with the web-demo fallback when the frame reports a late error', async () => {
    (globalThis as any).IntersectionObserver = undefined;
    const { host, ctl } = fakeHost();
    const el = context3dCard('GANSW1', host);
    await flush();
    const stage = el.querySelector('.c3-stage')!;
    stage.dispatchEvent(new CustomEvent('gt3d-fail', { detail: 'WebGL lost' }));
    expect(el.textContent).toContain('3D view unavailable on this page right now');
    expect(el.querySelector('.c3-fallback a')?.getAttribute('href')).toBe('https://groundtruth-tawny-one.vercel.app/demo');
    expect(ctl.destroy).toHaveBeenCalled();
  });

  it('upgrades the caption to the headroom insight once the map reports it, and wires Reset view', async () => {
    (globalThis as any).IntersectionObserver = undefined;
    const resetView = vi.fn();
    const ctl: MapController = { setOverlay: vi.fn(), resetView, destroy: vi.fn(), insight: { known: true, nearM: 100, count: 2, minStoreys: 6, maxStoreys: 6, biggest: { distanceM: 40, direction: 'north', storeys: 6, maxHeightM: 27, actualM: 7, source: 'hob' }, subjectActualM: 6 } };
    const host: Context3DHost = { load: vi.fn(async () => DATA), mount: vi.fn(async () => ctl) };
    const el = context3dCard('GANSW1', host);
    await flush(); await flush();
    expect(el.querySelector('.c3-lead')?.textContent).toBe('2 lots within 100 m could rise ~6 more storeys');
    expect(el.textContent).toContain('Biggest: 40 m north');
    expect(el.textContent).toContain('about 6 m today');
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset view')!.click();
    expect(resetView).toHaveBeenCalled();
    const hr = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Headroom')!;
    expect(hr.getAttribute('aria-pressed')).toBe('true');
    hr.click();
    expect(ctl.setOverlay).toHaveBeenCalledWith('headroom', false);
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
