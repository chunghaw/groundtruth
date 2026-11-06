"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PRESETS, type Preset } from "./presets";

type GtEvent =
  | { type: "lookup"; key: string; raw: string }
  | { type: "rendered"; key: string; state: string }
  | { type: "stale-dropped"; key: string; raw: string };

interface GtHandle {
  showListing(address: string, opts?: { listingId?: string; delayMs?: number }): Promise<void>;
  showManual(address: string): Promise<void>;
  destroy(): void;
}
interface GtModule {
  mount(container: HTMLElement, opts: { proxyBase?: string; siteName?: string; onEvent?: (e: GtEvent) => void }): GtHandle;
}

const PANEL_SRC = "/groundtruth-panel.js";
const SITE_NAME = "Example Listing Site";

function describe(e: GtEvent): string {
  if (e.type === "lookup") return `read heading → resolve “${e.raw}”`;
  if (e.type === "rendered") return `panel rendered: ${e.state}`;
  return `stale response for “${e.raw}” dropped (page moved on)`;
}

export function DemoClient({ mock }: { mock: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const gt = useRef<GtHandle | null>(null);
  const [listing, setListing] = useState<Preset>(PRESETS[0]);
  const [log, setLog] = useState<readonly string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let cancelled = false;
    import(/* webpackIgnore: true */ PANEL_SRC)
      .then((mod: GtModule) => {
        if (cancelled || !panelRef.current) return;
        gt.current = mod.mount(panelRef.current, {
          proxyBase: "",
          siteName: SITE_NAME,
          onEvent: (e) => setLog((prev) => [`${new Date().toLocaleTimeString()}  ${describe(e)}`, ...prev].slice(0, 8)),
        });
        void gt.current.showListing(PRESETS[0].address, { listingId: PRESETS[0].id });
      })
      .catch(() => setLoadError("Couldn't load the Groundtruth panel script. Refresh to try again."));
    return () => {
      cancelled = true;
      gt.current?.destroy();
      gt.current = null;
    };
  }, []);

  const open = (p: Preset, delayMs = 0) => {
    setListing(p);
    void gt.current?.showListing(p.address, { listingId: p.id, delayMs });
  };

  // Simulates a single-page-app navigation: a slow lookup for the current listing is still in flight
  // when the page swaps to the next listing in place. The late answer must never land on the new page.
  const spaSwitch = () => {
    const from = listing;
    const to = PRESETS[(PRESETS.indexOf(from) + 1) % PRESETS.length];
    void gt.current?.showListing(from.address, { listingId: `${from.id}-slow`, delayMs: 1800 });
    setTimeout(() => open(to), 500);
  };

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (text.length < 5 || text.length > 200) return;
    void gt.current?.showManual(text);
  };

  return (
    <div className="demo">
      <header className="demo-bar">
        <a href="/" className="demo-brand">Groundtruth</a>
        <span className="demo-tag">{mock ? "Demo · mock data" : "Demo · live data"}</span>
        <div className="demo-controls">
          <label>
            <span>Sample listing</span>
            <select value={listing.id} onChange={(e) => open(PRESETS.find((p) => p.id === e.target.value) ?? PRESETS[0])}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={spaSwitch} title="Swap the listing in place while a slow lookup is still running">SPA switch</button>
          <form onSubmit={submitTyped}>
            <input aria-label="Type any address" placeholder="Type any address…" value={typed} maxLength={200} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit">Look up</button>
          </form>
        </div>
      </header>

      <main className="demo-stage">
        <article className="listing" aria-label="Fictional listing page">
          <div className="listing-site">
            <span className="listing-site-name">{SITE_NAME}</span>
            <span className="listing-site-note">fictional mock page · not a real listing</span>
          </div>
          <div className="listing-photo" aria-hidden="true"><span>{listing.kind}</span></div>
          <h1 className="listing-address">{listing.address}</h1>
          <p className="listing-facts">{listing.kind} · {listing.beds} bed · {listing.baths} bath · {listing.cars} car</p>
          <p className="listing-price">Price guide: Contact agent</p>
          <p className="listing-blurb">{listing.blurb}</p>
          <p className="listing-expect">Expected panel state: <b>{listing.expect.replace("_", " ")}</b></p>
          <section className="demo-log" aria-label="What Groundtruth did">
            <h2>Panel log</h2>
            {log.length === 0 ? <p>Waiting for the panel…</p> : <ol>{log.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}</ol>}
          </section>
        </article>
        <aside className="panel-slot" aria-label="Groundtruth panel">
          {loadError ? <p role="alert">{loadError}</p> : null}
          <div ref={panelRef} />
        </aside>
      </main>
    </div>
  );
}
