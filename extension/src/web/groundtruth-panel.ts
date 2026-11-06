/**
 * Web build of the Groundtruth panel (dist-web/groundtruth-panel.js).
 * Reuses the extension's Panel, lookup client and stale-response guard; only the
 * page plumbing differs (no chrome.* APIs, no listing-site extractors).
 */
import { configureProxy } from '../api';
import type { Candidate, ResolveResponse } from '../api-types';
import { Panel } from '../content/panel';
import { CurrentListing } from '../content/watch';
import { parseAddressLine } from '../extract/parseAddress';
import type { Extraction } from '../extract/types';
import { getFacts, lookup } from '../lookup';
import { manualExtraction } from '../manual';

export interface MountOptions {
  /** Proxy origin; '' (default) means same origin as the page. */
  readonly proxyBase?: string;
  /** Shared client token; omit for same-origin demo pages. */
  readonly clientToken?: string;
  /** Label shown in the match receipt for page-read addresses. */
  readonly siteName?: string;
  /** Observability hook for demos (e.g. a log of dropped stale responses). */
  readonly onEvent?: (e: GroundtruthEvent) => void;
}

export type GroundtruthEvent =
  | { readonly type: 'lookup'; readonly key: string; readonly raw: string }
  | { readonly type: 'rendered'; readonly key: string; readonly state: string }
  | { readonly type: 'stale-dropped'; readonly key: string; readonly raw: string };

export interface ShowOptions {
  /** Listing id the "page" is showing; changes when the SPA navigates. */
  readonly listingId?: string;
  /** Artificial network delay, to demonstrate the stale-page protection. */
  readonly delayMs?: number;
}

export interface GroundtruthHandle {
  /** Render the panel for an address read from the page heading. */
  showListing(address: string, opts?: ShowOptions): Promise<void>;
  /** Render the panel for an address the user typed. */
  showManual(address: string): Promise<void>;
  destroy(): void;
}

const keyFor = (ex: Extraction): string => `${ex.source}:${ex.listingId ?? ex.raw}`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function mount(container: HTMLElement, options: MountOptions = {}): GroundtruthHandle {
  configureProxy({ proxyBase: options.proxyBase ?? '', clientToken: options.clientToken ?? '' });
  const emit = options.onEvent ?? (() => {});
  const site = options.siteName ?? 'this page';
  const current = new CurrentListing();
  let lastListing: Extraction | null = null;
  let active: { ex: Extraction; resolve: ResolveResponse; bedrooms: number | null } | null = null;

  const panel = new Panel(
    {
      onBedrooms: (n) => { if (active) void run(active.ex, n); },
      onPick: (c) => void pick(c),
      onManual: (text) => void run(manualExtraction(text), null),
      onRetry: () => { if (lastListing) void run(lastListing, null); },
    },
    { container, siteLabel: (ex) => (ex.source === 'manual' && ex.from === 'manual' ? 'you' : site) },
  );

  async function run(ex: Extraction, bedrooms: number | null, delayMs = 0): Promise<void> {
    const key = keyFor(ex);
    const token = current.begin(key);
    if (ex.from !== 'manual') lastListing = ex;
    panel.resetGuide();
    panel.render({ kind: 'loading', ex });
    emit({ type: 'lookup', key, raw: ex.raw });
    if (delayMs > 0) await wait(delayMs);
    const res = await lookup(key, { source: ex.source, raw: ex.raw, parts: ex.parts, bedrooms });
    if (!current.isCurrent(token, key)) { emit({ type: 'stale-dropped', key, raw: ex.raw }); return; }
    if (!res.ok) { panel.render({ kind: 'error', ex, message: res.error }); return; }
    active = { ex, resolve: res.resolve, bedrooms };
    panel.render({ kind: 'result', ex, resolve: res.resolve, facts: res.facts, factsError: res.factsError, bedrooms });
    emit({ type: 'rendered', key, state: res.resolve.state });
  }

  async function pick(c: Candidate): Promise<void> {
    if (!active) return;
    const { ex, resolve, bedrooms } = active;
    const key = keyFor(ex);
    const token = current.begin(key);
    panel.render({ kind: 'result', ex, resolve, facts: null, bedrooms, picked: c, factsPending: true });
    let facts = null;
    let factsError: string | undefined;
    try { facts = await getFacts(c.gnafId); } catch (e) { factsError = (e as Error).message; }
    if (!current.isCurrent(token, key)) return;
    panel.render({ kind: 'result', ex, resolve, facts, factsError, bedrooms, picked: c });
  }

  return {
    showListing(address, opts = {}) {
      const raw = address.replace(/\s+/g, ' ').trim();
      const ex: Extraction = { source: 'manual', listingId: opts.listingId ?? raw, raw, parts: parseAddressLine(raw), from: 'h1' };
      return run(ex, null, opts.delayMs ?? 0);
    },
    showManual(address) { return run(manualExtraction(address), null); },
    destroy() { panel.destroy(); },
  };
}
