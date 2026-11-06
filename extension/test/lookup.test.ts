import { lookup } from '../src/lookup';
import { CLIENT_HEADER } from '../src/config';

const req = { source: 'rea' as const, raw: '1/2 A St, Redfern NSW 2016', parts: null, bedrooms: null };

function mockFetch(routes: Record<string, unknown>, calls: Array<[string, RequestInit]> = []) {
  return (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response('nf', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('lookup', () => {
  it('resolves then fetches facts for EXACT, sending client header', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const f = mockFetch({
      '/api/resolve': { state: 'EXACT', confidence: 95, gnafId: 'GANSW1', receipt: { read: 'x', normalised: 'y', checks: {} }, candidates: [] },
      '/api/facts/GANSW1': { gnafId: 'GANSW1', facts: { avm: { available: false, data: null } } },
    }, calls);
    const r = await lookup('k1', req, f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts?.gnafId).toBe('GANSW1');
    expect((calls[0][1].headers as Record<string, string>)[CLIENT_HEADER]).toBeTruthy();
    expect(JSON.parse(calls[0][1].body as string)).toEqual(req);
  });

  it('does not fetch facts for BUILDING', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const f = mockFetch({ '/api/resolve': { state: 'BUILDING', confidence: 50, gnafId: null, receipt: { read: 'x', normalised: 'y', checks: {} }, candidates: [{ gnafId: 'a', label: '1/2', bedrooms: 1 }] } }, calls);
    const r = await lookup('k2', req, f);
    expect(r.ok && r.facts).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('reports unreachable proxy instead of hanging', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const r = await lookup('k3', req, f);
    expect(r).toMatchObject({ ok: false, kind: 'unreachable' });
  });

  it('reports http errors and malformed responses', async () => {
    const r401 = await lookup('k4', req, (async () => new Response('', { status: 401 })) as any);
    expect(r401).toMatchObject({ ok: false, kind: 'http' });
    const bad = await lookup('k5', req, (async () => new Response('{"nope":1}', { status: 200 })) as any);
    expect(bad).toMatchObject({ ok: false, kind: 'bad-response' });
  });
});
