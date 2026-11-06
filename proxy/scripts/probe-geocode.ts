/**
 * 11:00 validation probe. Reads addresses (one per line) and, for each, prints the raw
 * Microburbs geocode candidates and what our resolver decides. Also prints the City of Sydney
 * suburb list and the CSV header/auto-detected mapping. Full JSON goes to api-output/ (gitignored).
 *
 *   cp .env.example .env.local   # paste MICROBURBS_API_KEY
 *   npm run probe -- scripts/probe-addresses.txt
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

async function main(): Promise<void> {
  const { getUpstream, dataOf, isMock } = await import("../src/lib/microburbs");
  const { resolve } = await import("../src/lib/resolve");
  const { liveDeps, loadAreaFromApi } = await import("../src/lib/upstreamDeps");
  const { detectColumns, indexStatus } = await import("../src/lib/addressIndex");
  const { parseAddress, formatNormalised } = await import("../src/lib/normalise");
  const { areaSource } = await import("../src/lib/area");

  const file = process.argv[2] ?? "scripts/probe-addresses.txt";
  const addresses = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  console.log(`mode: ${isMock() ? "MOCK (no key!)" : "LIVE"}  addresses: ${addresses.length}`);

  const suburbs = await getUpstream("/v1/suburbs/list?lga=Sydney");
  const subList = dataOf<Array<{ suburb: string }>>(suburbs) ?? [];
  console.log(`\n/v1/suburbs/list?lga=Sydney -> ${suburbs.status}, ${subList.length} rows:`, subList.map((s) => s.suburb).join(", "));
  await loadAreaFromApi();
  console.log(`area source: ${areaSource()}`);

  const csv = process.env.ADDRESS_CSV_PATH || path.resolve("../data/addresses-city-of-sydney.csv");
  if (existsSync(csv)) {
    const head = readFileSync(csv, "utf8").slice(0, 4000).split("\n").slice(0, 3);
    console.log(`\nCSV ${csv}\n  header: ${head[0]}\n  row1:   ${head[1]}\n  detected mapping:`, detectColumns(head[0].split(",").map((h) => h.replace(/"/g, "").trim())));
  } else {
    console.log(`\nCSV not found at ${csv}`);
  }
  const idx = indexStatus();
  console.log(`address index: loaded=${idx.loaded} rows=${idx.rows} source=${idx.source} error=${idx.error}`);

  const deps = liveDeps();
  const out: unknown[] = [];
  for (const raw of addresses) {
    const q = raw.replace(/,?\s*NSW\s*\d{4}$/i, "");
    const geo = await getUpstream(`/v1/geocode/address?address=${encodeURIComponent(q)}`);
    const cands = dataOf<Array<{ id: string; display_name: string; abbr: string; property_type: string }>>(geo) ?? [];
    const result = await resolve({ source: "manual", raw, parts: null, bedrooms: null }, deps);
    console.log(`\n## ${raw}\n   normalised: ${formatNormalised(parseAddress(raw))}\n   geocode(${q}) -> ${geo.status}, ${cands.length} candidates`);
    for (const c of cands) console.log(`     ${c.id}  ${c.display_name}  | ${c.abbr} | ${c.property_type}  => ${formatNormalised(parseAddress(c.display_name))}`);
    console.log(`   RESOLVE: ${result.state} conf=${result.confidence} gnaf=${result.gnafId} cands=${result.candidates.length} query="${result.receipt.query}" :: ${result.message}`);
    out.push({ raw, geocodeStatus: geo.status, geocodeBody: geo.body, resolve: result });
  }
  mkdirSync("api-output", { recursive: true });
  const dest = path.join("api-output", `probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(dest, JSON.stringify({ suburbs: suburbs.body, results: out }, null, 2));
  console.log(`\nwrote ${dest}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
