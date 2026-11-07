"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { presetsFor, splitAddress, type Preset } from "./presets";
import { HeroMap } from "./components/HeroMap";
import { StreetPhoto } from "./components/StreetPhoto";
import { BathIcon, BedIcon, CarIcon, FloorPlan, HomeIcon } from "./components/Illustrations";

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
const SITE_NAME = "Homestead (example site)";

function describe(e: GtEvent): string {
  if (e.type === "lookup") return `read heading → resolve “${e.raw}”`;
  if (e.type === "rendered") return `panel rendered: ${e.state}`;
  return `stale response for “${e.raw}” dropped (page moved on)`;
}

interface LogLine { readonly at: string; readonly text: string; readonly kind: GtEvent["type"] }

export function DemoClient({ mock }: { mock: boolean }) {
  const PRESETS = presetsFor(mock);
  const panelRef = useRef<HTMLDivElement>(null);
  const gt = useRef<GtHandle | null>(null);
  const [listing, setListing] = useState<Preset>(PRESETS[0]);
  const [log, setLog] = useState<readonly LogLine[]>([]);
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
          onEvent: (e) => setLog((prev) => [{ at: new Date().toLocaleTimeString(), text: describe(e), kind: e.type }, ...prev].slice(0, 8)),
        });
        void gt.current.showListing(PRESETS[0].address, { listingId: PRESETS[0].id });
      })
      .catch(() => setLoadError("Couldn't load the Groundtruth panel script. Refresh to try again."));
    return () => {
      cancelled = true;
      gt.current?.destroy();
      gt.current = null;
    };
  }, [PRESETS]);

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

  const [street, suburb] = splitAddress(listing.address);
  const suburbName = suburb.replace(/\s+NSW.*$/, "");

  return (
    <div className="demo">
      <header className="demo-bar">
        <a href="/" className="demo-brand"><span className="gt-mark" aria-hidden="true" />Groundtruth</a>
        <span className="demo-tag">{mock ? "Live demo · mock data" : "Live demo · real data"}</span>
        <div className="demo-controls">
          <label>
            <span>Sample listing</span>
            <select value={listing.id} onChange={(e) => open(PRESETS.find((p) => p.id === e.target.value) ?? PRESETS[0])}>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className="ghost" onClick={spaSwitch} title="Swap the listing in place while a slow lookup is still running">SPA switch</button>
          <form onSubmit={submitTyped}>
            <input aria-label="Type any address" placeholder="Type any address…" value={typed} maxLength={200} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit">Look up</button>
          </form>
        </div>
      </header>

      <div className="portal">
        <header className="portal-bar">
          <span className="portal-logo" aria-label="Homestead, a fictional listing site"><span className="portal-glyph" aria-hidden="true" />homestead</span>
          <nav className="portal-nav" aria-label="Example site sections (inactive)">
            <span aria-current="page">Buy</span><span>Rent</span><span>Sold</span><span>Agents</span>
          </nav>
          <span className="portal-note">Example listing site · fictional · not a real listing</span>
        </header>

        <main className="stage">
          <div className="listing-col">
            <nav className="crumbs" aria-label="Breadcrumb"><span>Buy</span><span>NSW</span><span>{suburbName}</span><span aria-current="page">{street}</span></nav>
            <section className="gallery" aria-label="Listing media (map and illustrations, no photos)">
              <HeroMap lat={listing.lat} lon={listing.lon} label={listing.address} />
              <div className="gallery-side">
                <StreetPhoto lat={listing.lat} lon={listing.lon} kind={listing.kind} />
                <figure className="tile tile-plan"><FloorPlan beds={listing.beds} /><figcaption>Floor plan · schematic</figcaption></figure>
              </div>
            </section>

            <article className="listing" aria-label="Fictional listing page">
              <div className="listing-head">
                <div>
                  <p className="listing-kicker">{listing.kind} · for sale</p>
                  <h1 className="listing-address"><span className="l1">{street},</span> <span className="l2">{suburb}</span></h1>
                </div>
                <p className="reads-note" aria-hidden="true"><span>Groundtruth reads only this line</span></p>
              </div>
              <ul className="specs" aria-label="Key features">
                <li><BedIcon /><b>{listing.beds}</b> bed</li>
                <li><BathIcon /><b>{listing.baths}</b> bath</li>
                <li><CarIcon /><b>{listing.cars}</b> car</li>
                <li><HomeIcon />{listing.kind}</li>
              </ul>
              <div className="price-row">
                <p className="listing-price">Contact agent</p>
                <p className="listing-inspect">Inspection by appointment</p>
              </div>
              <section className="about" aria-labelledby="about-h">
                <h2 id="about-h">{listing.headline}</h2>
                <p className="listing-blurb">{listing.blurb}</p>
                <p className="placeholder-copy">Placeholder description. This demo page is ours: the copy, map and drawings are made for it, and nothing is copied from a real listing. On a real portal, Groundtruth ignores this text, the price and the photos.</p>
              </section>
              <section className="inspector" aria-label="What Groundtruth did">
                <div className="inspector-head">
                  <h2>Demo inspector</h2>
                  <p className="listing-expect">Expected panel state <b className={`st st-${listing.expect}`}>{listing.expect.replace("_", " ")}</b></p>
                </div>
                <div className="demo-log">
                  {log.length === 0 ? <p>Waiting for the panel…</p> : (
                    <ol>{log.map((l, i) => <li key={`${i}-${l.text}`} className={`ev-${l.kind}`}><time>{l.at}</time>{l.text}</li>)}</ol>
                  )}
                </div>
              </section>
            </article>
          </div>
          <aside className="panel-slot" aria-label="Groundtruth panel, docked as the extension would appear">
            {loadError ? <p role="alert" className="panel-error">{loadError}</p> : null}
            <div ref={panelRef} />
          </aside>
        </main>
        <footer className="portal-foot">
          <p>Homestead is a fictional listing site built to demo Groundtruth. Map data © OpenStreetMap contributors · tiles by OpenFreeMap.</p>
        </footer>
      </div>
    </div>
  );
}
