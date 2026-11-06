import type { BgRequest, Candidate, FactsResponse, LookupResult } from '../api-types';
import { extractFromDocument, listingIdFromUrl } from '../extract';
import type { Extraction } from '../extract/types';
import { manualExtraction } from '../manual';
import { Panel, type PanelView } from './panel';
import { CurrentListing, watchListing } from './watch';

const current = new CurrentListing();
let firstExtraction = true;
let lastSignature = '';
let manualOverride: Extraction | null = null;
let manualHref = '';
let panel: Panel | null = null;

function send<T>(msg: BgRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

function keyFor(ex: Extraction): string { return `${ex.source}:${ex.listingId ?? ex.raw}`; }

function ensurePanel(): Panel {
  if (!panel) panel = new Panel({ onBedrooms: (n) => run(true, n), onPick: pick, onManual: manual, onRetry: () => { manualOverride = null; run(true); } });
  return panel;
}

async function lookupAndRender(ex: Extraction, bedrooms: number | null): Promise<void> {
  const key = keyFor(ex);
  const token = current.begin(key);
  const p = ensurePanel();
  p.render({ kind: 'loading', ex });
  let res: LookupResult;
  try {
    res = await send<LookupResult>({ type: 'gt:lookup', key, from: ex.from, req: { source: ex.source, raw: ex.raw, parts: ex.parts, bedrooms } });
  } catch (e) {
    res = { ok: false, key, error: 'Extension background is not responding. Reload the page.', kind: 'unreachable' };
  }
  if (!current.isCurrent(token, key)) return; // stale: user moved to another listing
  if (!res) { p.render({ kind: 'error', ex, message: 'No response from the extension background.' }); return; }
  if (!res.ok) { p.render({ kind: 'error', ex, message: res.error }); return; }
  p.render({ kind: 'result', ex, resolve: res.resolve, facts: res.facts, factsError: res.factsError, bedrooms });
  activeView = { ex, resolve: res.resolve, bedrooms };
}

let activeView: { ex: Extraction; resolve: import('../api-types').ResolveResponse; bedrooms: number | null } | null = null;

async function pick(c: Candidate): Promise<void> {
  if (!activeView) return;
  const { ex, resolve, bedrooms } = activeView;
  const key = keyFor(ex);
  const token = current.begin(key);
  const p = ensurePanel();
  const base: PanelView = { kind: 'result', ex, resolve, facts: null, bedrooms, picked: c, factsPending: true };
  p.render(base);
  const r = await send<{ ok: boolean; facts?: FactsResponse; error?: string }>({ type: 'gt:facts', key, gnafId: c.gnafId }).catch(() => ({ ok: false, error: 'Extension background not responding.' }) as { ok: boolean; error?: string; facts?: FactsResponse });
  if (!current.isCurrent(token, key)) return;
  p.render({ ...base, factsPending: false, facts: r.ok ? r.facts ?? null : null, factsError: r.error });
}

function manual(text: string): void {
  manualOverride = manualExtraction(text);
  manualHref = location.href;
  ensurePanel().resetGuide();
  void lookupAndRender(manualOverride, null);
}

let prevListing: { id: string | null; raw: string } | null = null;
let staleSince: { id: string | null; at: number } | null = null;
const STALE_GRACE_MS = 2500;

function staleGraceExpired(id: string | null): boolean {
  if (!staleSince || staleSince.id !== id) {
    staleSince = { id, at: Date.now() };
    setTimeout(() => run(), STALE_GRACE_MS + 50);
    return false;
  }
  return Date.now() - staleSince.at >= STALE_GRACE_MS;
}

function run(force = false, bedrooms: number | null = null): void {
  if (manualOverride && !force) return;
  const ex = manualOverride ?? extractFromDocument(document, location.href, { freshLoad: firstExtraction });
  if (!listingIdFromUrl(location.href) && !manualOverride) {
    // Not a listing page (search results etc.): hide the panel.
    panel?.destroy(); panel = null; lastSignature = ''; activeView = null;
    return;
  }
  if (!ex) return; // listing page but h1 not rendered yet; watcher will call again
  firstExtraction = false;
  // SPA race: URL already points at a new listing but the h1 still shows the previous one.
  // Wait for the h1 to change; if it never does (same address relisted), proceed after a grace period.
  if (!force && !manualOverride && prevListing && prevListing.id !== ex.listingId && prevListing.raw === ex.raw && !staleGraceExpired(ex.listingId)) return;
  prevListing = { id: ex.listingId, raw: ex.raw };
  const sig = `${keyFor(ex)}|${ex.raw}|${bedrooms ?? ''}`;
  if (sig === lastSignature && !force) { panel?.mount(); return; }
  if (keyFor(ex) !== lastSignature.split('|')[0]) ensurePanel().resetGuide();
  lastSignature = sig;
  void lookupAndRender(ex, bedrooms);
}

watchListing({
  onChange: () => {
    // A real navigation cancels a manual override made on the previous page.
    if (manualOverride && location.href !== manualHref) manualOverride = null;
    run();
  },
});
run();

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === 'gt:open-manual') ensurePanel().render({ kind: 'manual', prefill: '' });
});
