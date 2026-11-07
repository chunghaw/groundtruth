import { fetchBriefing, configureProxy } from '../src/api';
import { BriefingControl, splitSentences, sentenceAtFraction, toBase64, fromBase64 } from '../src/content/briefing';

describe('briefing helpers', () => {
  it('splits a script into sentences', () => {
    expect(splitSentences('One two. Three? Four!  ')).toEqual(['One two.', 'Three?', 'Four!']);
    expect(splitSentences('')).toEqual([]);
  });
  it('maps playback progress to a sentence by length', () => {
    const s = ['aaaa', 'bbbb', 'cccccccc'];
    expect(sentenceAtFraction(s, 0)).toBe(0);
    expect(sentenceAtFraction(s, 0.3)).toBe(1);
    expect(sentenceAtFraction(s, 0.9)).toBe(2);
    expect(sentenceAtFraction(s, 1)).toBe(2);
  });
  it('round-trips audio bytes through base64 for MV3 messaging', () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128]);
    expect(new Uint8Array(fromBase64(toBase64(bytes.buffer)))).toEqual(bytes);
  });
});

describe('fetchBriefing', () => {
  beforeEach(() => configureProxy({ proxyBase: 'http://p', clientToken: 't' }));
  it('returns the script and no audio for a JSON reply', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ script: 'Hello.', audio: null }), { headers: { 'content-type': 'application/json' } }));
    const r = await fetchBriefing('GANSW1', f as any);
    expect(r).toEqual({ script: 'Hello.', audio: null });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('http://p/api/briefing/GANSW1');
    expect(init.method).toBe('POST');
  });
  it('returns audio bytes and the header script for an audio reply', async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'audio/mpeg', 'x-briefing-script': encodeURIComponent('Hi, there.') } }));
    const r = await fetchBriefing('GANSW1', f as any);
    expect(r.script).toBe('Hi, there.');
    expect(new Uint8Array(r.audio!)).toEqual(new Uint8Array([9, 9]));
  });
  it('throws on HTTP errors', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 429 }));
    await expect(fetchBriefing('GANSW1', f as any)).rejects.toThrow(/429/);
  });
});

describe('BriefingControl', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('fetches, speaks each sentence with captions, and returns to idle', async () => {
    const spoken: string[] = [];
    let release: () => void = () => {};
    const deps = {
      fetchBriefing: vi.fn(async () => ({ script: 'First bit. Second bit.', audio: null })),
      speak: vi.fn((t: string) => { spoken.push(t); return new Promise<void>((r) => { release = r; }); }),
      cancelSpeech: vi.fn(),
    };
    const c = new BriefingControl(deps);
    const btn = c.button('GANSW1');
    const cap = c.captions();
    expect(btn.textContent).toContain('Listen · 30s');
    btn.click();
    await flush();
    expect(deps.fetchBriefing).toHaveBeenCalledWith('GANSW1');
    expect(cap.hidden).toBe(false);
    expect(cap.querySelector('.now')?.textContent).toBe('First bit.');
    expect(btn.textContent).toContain('Stop');
    release(); await flush();
    expect(cap.querySelector('.now')?.textContent).toBe('Second bit.');
    release(); await flush();
    expect(spoken).toEqual(['First bit.', 'Second bit.']);
    expect(btn.textContent).toContain('Listen · 30s');
    expect(cap.hidden).toBe(true);
  });

  it('stops on demand and when the home changes', async () => {
    const deps = {
      fetchBriefing: vi.fn(async () => ({ script: 'A. B.', audio: null })),
      speak: vi.fn(() => new Promise<void>(() => {})),
      cancelSpeech: vi.fn(),
    };
    const c = new BriefingControl(deps);
    const btn = c.button('G1');
    btn.click(); await flush();
    btn.click(); // stop
    expect(deps.cancelSpeech).toHaveBeenCalled();
    expect(c.captions().hidden).toBe(true);
    btn.click(); await flush();
    c.button('G2'); // different home: stop
    expect(deps.cancelSpeech).toHaveBeenCalledTimes(2);
    expect(btn.textContent).toContain('Listen · 30s');
  });

  it('shows a short error when the briefing cannot be fetched', async () => {
    const c = new BriefingControl({ fetchBriefing: vi.fn(async () => { throw new Error('down'); }), speak: vi.fn(), cancelSpeech: vi.fn() });
    const btn = c.button('G1');
    btn.click(); await flush();
    expect(c.captions().textContent).toMatch(/unavailable/i);
    expect(btn.textContent).toContain('Listen · 30s');
  });
});

describe('Panel briefing button', () => {
  it('appears in the header only once facts are loaded, and is a real button', async () => {
    const { Panel } = await import('../src/content/panel');
    const deps = { fetchBriefing: vi.fn(async () => ({ script: 'Hi.', audio: null })), speak: vi.fn(async () => {}), cancelSpeech: vi.fn() };
    const p = new Panel({ onBedrooms: vi.fn(), onPick: vi.fn(), onManual: vi.fn(), onRetry: vi.fn() }, { briefing: deps });
    const root = (p as any).root as ShadowRoot;
    const ex = { source: 'rea' as const, listingId: '1', raw: '1 Crown St, Surry Hills NSW 2010', parts: null, from: 'h1' as const };
    p.render({ kind: 'loading', ex });
    expect(root.querySelector('header .brief-btn')).toBeNull();
    const resolve = { state: 'EXACT' as const, confidence: 90, gnafId: 'GANSW1', receipt: { read: ex.raw, normalised: 'x', checks: {} }, candidates: [] };
    p.render({ kind: 'result', ex, resolve, bedrooms: null, facts: { gnafId: 'GANSW1', facts: {} } });
    const btn = root.querySelector('header .brief-btn') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-label')).toMatch(/30-second/);
    p.destroy();
  });
});
