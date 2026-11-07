import { describe, expect, it, vi } from 'vitest';
import { factsVerdict } from '../src/content/verdict';
import { subjectCaption } from '../src/context3d/card';
import { fetchContext3D } from '../src/context3d/api';
import type { FactsResponse } from '../src/api-types';
import type { Context3D } from '../src/context3d/types';

const na = { available: false, data: null, reason: 'x' };
const facts = (over: Partial<FactsResponse['facts']>): FactsResponse => ({ gnafId: 'G', facts: { agentQuoting: na, avm: na, saleHistory: na, streetProfile: na, ...over } });

describe('verdict on live data (agent quoting usually absent)', () => {
  it('falls back to the last recorded sale, ignoring listings', () => {
    const v = factsVerdict(facts({ saleHistory: { available: true, data: [{ date: '2025-03-18', price: 2500000, type: 'For Sale' }, { date: '2025-04-11', price: 2750000, type: 'Sold' }, { date: '2010-09-25', price: 845000, type: 'Sold' }] } }));
    expect(v.kicker).toBe('Sale record');
    expect(v.headline[1]).toMatch(/2\.75/);
    expect(v.sub).toContain('2025-04-11');
  });
  it('then to the street typical price', () => {
    const v = factsVerdict(facts({ streetProfile: { available: true, data: { street: 'Marriott Street', profile: { current_price: 2020000, n_sales: 279 } } } }));
    expect(v.kicker).toBe('Street check');
    expect(v.headline[0]).toContain('Marriott Street');
  });
  it('prefers the AVM over both', () => {
    const v = factsVerdict(facts({ avm: { available: true, data: { predicted_price: 1080858 } }, streetProfile: { available: true, data: { profile: { current_price: 1 } } } }));
    expect(v.kicker).toBe('Independent value');
  });
});

describe('3D live tweaks', () => {
  const d = { subject: { maxHeightM: 3, storeys: 1, source: 'hob' } } as unknown as Context3D;
  it('says when the building already exceeds its control', () => {
    expect(subjectCaption(d, 30)).toContain('above today');
    expect(subjectCaption(d, 4)).toContain('about 4 m today');
  });
  it('passes the home location to the proxy', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ gnafId: 'G', lots: { features: [] } }), { status: 200 }));
    await fetchContext3D('GANSW1', f as unknown as typeof fetch, { lat: -33.9, lng: 151.2 });
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/api\/context3d\/GANSW1\?lat=-33\.9&lng=151\.2$/);
  });
});
