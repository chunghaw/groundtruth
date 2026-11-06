import "./demo/demo.css";

export default function Home() {
  return (
    <main className="landing">
      <h1>Groundtruth</h1>
      <p>
        Groundtruth is a browser extension that reads only the address heading of a property listing, matches it to one
        exact home in the national address file (G-NAF) — or honestly says it can&apos;t — and shows independent
        Microburbs facts beside the listing: estimated value, how the agency&apos;s guides compare with sale prices, sale
        history, street profile, risks and strata levies. Every answer comes with a match receipt showing what was read
        and which checks passed.
      </p>
      <a className="cta" href="/demo">Try the demo</a>
      <small>API: POST /api/resolve · GET /api/facts/:gnafId · GET /api/health</small>
    </main>
  );
}
