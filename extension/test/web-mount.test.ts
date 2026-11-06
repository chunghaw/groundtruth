import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type GroundtruthEvent } from '../src/web/groundtruth-panel';

const resolveBody = (raw: string, state: string) => ({
  state, confidence: 90, gnafId: state === 'EXACT' ? 'GANSW1' : null,
  receipt: { read: raw, normalised: raw.toUpperCase(), checks: { unit: true, number: true, street: true, suburb: true } },
  candidates: [], message: 'm',
});
const factsBody = { gnafId: 'GANSW1', facts: { basics: { available: true, data: { bed_count: 2 } } } };
const shadowText = (c: HTMLElement) => {
  const host = c.querySelector('groundtruth-panel') as HTMLElement & { shadowRoot: ShadowRoot | null };
  return host ? (host as any).shadowRoot?.textContent ?? '' : '';
};

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe('web mount', () => {
  it('mounts inside the container, calls same-origin proxy without a token header, renders result', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      const body = url.startsWith('/api/resolve') ? resolveBody('2/4 Web Street, Glebe', 'EXACT') : factsBody;
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const gt = mount(container, { siteName: 'Example Listing Site' });
    await gt.showListing('2/4 Web Street, Glebe NSW 2037');
    expect(container.querySelector('groundtruth-panel')).not.toBeNull();
    expect(document.documentElement.lastElementChild?.tagName).not.toBe('GROUNDTRUTH-PANEL');
    expect(calls[0].url).toBe('/api/resolve');
    expect(calls[1].url).toBe('/api/facts/GANSW1');
    expect(Object.keys(calls[0].headers).map((k) => k.toLowerCase())).not.toContain('x-groundtruth-client');
    gt.destroy();
  });

  it('drops a stale response when the listing changes mid-flight', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const raw = JSON.parse(String(init.body ?? '{}')).raw ?? '';
      return new Response(JSON.stringify(raw ? resolveBody(raw, 'NO_MATCH') : factsBody), { status: 200 });
    }));
    const events: GroundtruthEvent[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const gt = mount(container, { onEvent: (e) => events.push(e) });
    const slow = gt.showListing('1 First Street, Glebe', { listingId: 'a', delayMs: 40 });
    const fast = gt.showListing('8 Second Street, Glebe', { listingId: 'b' });
    await Promise.all([slow, fast]);
    expect(events.some((e) => e.type === 'stale-dropped' && e.raw === '1 First Street, Glebe')).toBe(true);
    expect(events.filter((e) => e.type === 'rendered').length).toBe(1);
    gt.destroy();
  });
});
