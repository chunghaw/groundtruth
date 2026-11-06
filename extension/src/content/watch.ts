/**
 * Listing-change detection for SPA sites: patches history, listens to popstate,
 * polls lightly, and observes h1 mutations. Calls onChange (debounced) whenever the
 * URL or the h1 text may have changed.
 */
export interface WatchOptions {
  readonly onChange: () => void;
  readonly debounceMs?: number;
  readonly pollMs?: number;
  readonly win?: Window;
}

export function watchListing({ onChange, debounceMs = 350, pollMs = 1000, win = window }: WatchOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastHref = win.location.href;
  let lastH1 = Array.from(win.document.querySelectorAll('h1'), (e) => e.textContent).join('|');
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const check = () => {
    const href = win.location.href;
    const h1 = Array.from(win.document.querySelectorAll('h1'), (e) => e.textContent).join('|');
    if (href !== lastHref || h1 !== lastH1) {
      lastHref = href;
      lastH1 = h1;
      fire();
    }
  };

  const hist = win.history;
  const origPush = hist.pushState;
  const origReplace = hist.replaceState;
  hist.pushState = function (...args: Parameters<History['pushState']>) {
    const r = origPush.apply(this, args);
    check();
    return r;
  };
  hist.replaceState = function (...args: Parameters<History['replaceState']>) {
    const r = origReplace.apply(this, args);
    check();
    return r;
  };
  win.addEventListener('popstate', check);
  const poll = setInterval(check, pollMs);
  // Only the h1 matters; observe subtree but filter cheaply via check().
  let moQueued = false;
  const mo = new MutationObserver(() => {
    if (moQueued) return;
    moQueued = true;
    setTimeout(() => { moQueued = false; check(); }, 150);
  });
  mo.observe(win.document.body, { childList: true, subtree: true, characterData: true });

  return () => {
    hist.pushState = origPush;
    hist.replaceState = origReplace;
    win.removeEventListener('popstate', check);
    clearInterval(poll);
    mo.disconnect();
    clearTimeout(timer);
  };
}

/** Tracks the "current" listing so stale async responses can be dropped. */
export class CurrentListing {
  private token = 0;
  private key: string | null = null;
  begin(key: string): number { this.key = key; return ++this.token; }
  isCurrent(token: number, key: string): boolean { return token === this.token && key === this.key; }
  get current(): string | null { return this.key; }
}
