import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "Groundtruth",
  description: "Independent facts about the exact home you're looking at, right on the listing.",
};

const REPO = "https://github.com/chunghaw/groundtruth";

const VALUES = [
  { n: "01", title: "Never the wrong home", body: "Every answer carries a match receipt: what we read, how we normalised it, the G-NAF record and which checks passed. If unit, number, street and suburb don't all agree, we ask instead of guessing." },
  { n: "02", title: "The guide, checked", body: "See how this agency's past price guides compared with what homes actually sold for, an independent valuation, and a realistic budget worked out from the guide you were given." },
  { n: "03", title: "Reads one line", body: "Only the address heading is read from the listing. Never the price, description, photos or agent details. Facts come from Microburbs and the national address file." },
] as const;

const STATES = [
  { k: "EXACT", t: "Show the facts", d: "All four parts agree" },
  { k: "BUILDING", t: "Ask which unit", d: "Building found, unit missing" },
  { k: "CHOOSE", t: "Let you pick", d: "Several records match" },
  { k: "NO_MATCH", t: "Say so plainly", d: "Nothing matches" },
] as const;

export default function Home() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a href="/" className="lp-brand"><span className="lp-mark" aria-hidden="true" />Groundtruth</a>
        <nav aria-label="Main navigation">
          <a href="#how">How matching works</a>
          <a href={REPO}>GitHub</a>
          <a href="/demo" className="lp-btn sm">Open the demo</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Chrome extension · City of Sydney pilot</p>
            <h1 id="hero-h">The facts the listing <em>leaves out.</em></h1>
            <p className="lp-lede">Groundtruth sits beside a listing on realestate.com.au or domain.com.au, matches it to one exact home, and shows independent data: how the agency&apos;s guides really compare, what the home is worth, and what it sold for before.</p>
            <div className="lp-ctas">
              <a href="/demo" className="lp-btn">Try the live demo</a>
              <a href={REPO} className="lp-btn ghost">View the code</a>
            </div>
            <dl className="lp-stats">
              <div><dt>Suburbs covered</dt><dd>29</dd></div>
              <div><dt>Held-out listings tested</dt><dd>30</dd></div>
              <div><dt>Lines read from the page</dt><dd>1</dd></div>
            </dl>
          </div>
          <figure className="lp-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/panel-shot.png" width={760} height={1112} alt="The Groundtruth panel showing a verified home, the agency's guide accuracy and a realistic budget" fetchPriority="high" />
            <figcaption>The panel, on our demo listing (mock data).</figcaption>
          </figure>
        </section>

        <section className="lp-values" aria-label="What you get">
          {VALUES.map((v) => (
            <article key={v.n}>
              <span className="lp-n">{v.n}</span>
              <h2>{v.title}</h2>
              <p>{v.body}</p>
            </article>
          ))}
        </section>

        <section id="how" className="lp-how" aria-labelledby="how-h">
          <div className="lp-how-head">
            <p className="lp-eyebrow">How matching works</p>
            <h2 id="how-h">A receipt for every answer.</h2>
            <p>A wrong home is worse than no answer. So the resolver only says <b>exact</b> when every part of the address agrees, and shows its working.</p>
          </div>
          <ol className="lp-flow">
            <li>
              <span className="lp-step">1 · Read</span>
              <p className="lp-paper">12/45 Crown Street, Surry Hills NSW 2010</p>
              <small>The page heading. Nothing else.</small>
            </li>
            <li>
              <span className="lp-step">2 · Parse</span>
              <p className="lp-tokens"><span><i>unit</i>12</span><span><i>number</i>45</span><span><i>street</i>CROWN ST</span><span><i>suburb</i>SURRY HILLS</span></p>
              <small>Handles 902/417-419, C603/, Level 8/…, 188A.</small>
            </li>
            <li>
              <span className="lp-step">3 · Match</span>
              <p className="lp-paper mono">G-NAF · GANSW71…<br /><span className="ok">✓ unit ✓ number ✓ street ✓ suburb</span></p>
              <small>Against the national address file.</small>
            </li>
            <li>
              <span className="lp-step">4 · Decide</span>
              <ul className="lp-states">
                {STATES.map((s) => <li key={s.k}><b className={`lp-st-${s.k}`}>{s.k.replace("_", " ")}</b><span>{s.t}</span><i>{s.d}</i></li>)}
              </ul>
            </li>
          </ol>
        </section>

        <section className="lp-cta" aria-labelledby="cta-h">
          <h2 id="cta-h">See it on a listing.</h2>
          <p>The demo runs the real panel on a fictional listing site. Switch between sample listings to see every match state.</p>
          <div className="lp-ctas">
            <a href="/demo" className="lp-btn light">Open the demo</a>
            <a href={REPO} className="lp-btn ghost light">github.com/chunghaw/groundtruth</a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <p>Built at the Microburbs hackathon, Sydney, November 2026. Data: Microburbs, G-NAF. API: POST /api/resolve · GET /api/facts/:gnafId · GET /api/health</p>
      </footer>
    </div>
  );
}
