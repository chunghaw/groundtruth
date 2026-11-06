/**
 * Pre-parses the supplied CSV into .data/address-index.json (gitignored) so a Vercel deploy can
 * ship the index with the resolve function (next.config.ts outputFileTracingIncludes).
 * The CSV itself never leaves ../data. Usage: npm run build-index [-- path/to.csv]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

async function main(): Promise<void> {
  const { rowsFromCsv, buildIndex } = await import("../src/lib/addressIndex");
  const csv = process.argv[2] || process.env.ADDRESS_CSV_PATH || path.resolve("../data/addresses-city-of-sydney.csv");
  const mapping = process.env.ADDRESS_CSV_COLUMNS ? JSON.parse(process.env.ADDRESS_CSV_COLUMNS) : undefined;
  const rows = rowsFromCsv(readFileSync(csv, "utf8"), mapping);
  const usable = rows.filter((r) => r.number && r.street && r.suburb);
  const index = buildIndex(usable);
  mkdirSync(".data", { recursive: true });
  writeFileSync(".data/address-index.json", JSON.stringify(usable.map(({ gnafId, unit, number, street, suburb }) => ({ gnafId, unit, number, street, suburb }))));
  console.log(`rows=${rows.length} usable=${usable.length} indexed=${index.size} withGnaf=${usable.filter((r) => r.gnafId).length} withUnit=${usable.filter((r) => r.unit).length}`);
  console.log("sample:", usable.slice(0, 3));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
