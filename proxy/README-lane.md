# Groundtruth proxy (PROXY + RESOLVER lane)

Next.js App Router API that implements `docs/CONTRACT.md`. The Microburbs key lives only here.

| Route | What it does |
|---|---|
| `POST /api/resolve` | Listing address to `EXACT / BUILDING / CHOOSE / NO_MATCH / OUT_OF_AREA` + receipt |
| `GET /api/facts/:gnafId` | 7 facts in parallel (paced 8 req/s, cached 1 h), public-housing fields removed |
| `GET /api/health` | `{ ok, mock, addressIndex: {loaded, rows}, area: "fallback" or "api" }` (no token needed) |

## Run locally

```bash
cd proxy
npm install
cp .env.example .env.local      # fill MICROBURBS_API_KEY + GROUNDTRUTH_CLIENT_TOKEN
npm test                        # vitest: normaliser, resolver, CSV index, facts, http, mock e2e
npm run dev                     # http://localhost:3000
```

Mock mode is on when `MOCK=1` or `MICROBURBS_API_KEY` is empty. Mock geocode rules:
unit given gives EXACT; no unit + odd number gives BUILDING (units 1-4); no unit + even number gives EXACT house;
an address containing `NOMATCH` gives NO_MATCH; a suburb outside City of Sydney gives OUT_OF_AREA.

Auth: every route except health needs `X-Groundtruth-Client: $GROUNDTRUTH_CLIENT_TOKEN`.
If the token env is unset the proxy is open in `next dev` and **closed (401) in production**.
CORS echoes `chrome-extension://*`, `https://www.realestate.com.au` and `https://www.domain.com.au`. Rate limit is 60-request burst, then 120/min per IP.

## Env vars

| Var | Purpose |
|---|---|
| `MICROBURBS_API_KEY` | Team key (server only) |
| `GROUNDTRUTH_CLIENT_TOKEN` | Shared token the extension sends |
| `ADDRESS_CSV_PATH` | Supplied CSV, default `../data/addresses-city-of-sydney.csv` (gitignored, never commit) |
| `ADDRESS_CSV_COLUMNS` | Optional JSON column map if auto-detect gets the headers wrong (see `.env.example`) |
| `MOCK` | `1` = fake data |

## At 11:00 (key + CSV arrive)

```bash
cd proxy
echo "MICROBURBS_API_KEY=<key>" >> .env.local
echo "GROUNDTRUTH_CLIENT_TOKEN=<pick one, share with extension lane>" >> .env.local
mkdir -p ../data && mv ~/Downloads/addresses-city-of-sydney.csv ../data/
npm run probe -- scripts/probe-addresses.txt     # ~21 addresses, about 45 API calls
```

The probe prints:
1. the `/v1/suburbs/list?lga=Sydney` rows (check there are 29; if 0, the LGA filter name is wrong, so try `q=` instead in `upstreamDeps.ts`)
2. the CSV header, first row and auto-detected column map (if it's wrong, set `ADDRESS_CSV_COLUMNS`)
3. for each address: the raw geocode candidates (`id | display_name | abbr | type`), how we parse each one, and the resolver decision

Full JSON goes to `api-output/probe-*.json` (gitignored). Check that `display_name` carries units as `902/417-419 ...`. If it uses another form (for example `Unit 902, ...`), `parseAddress` already handles it. Any new form needs a test in `tests/normalise.test.ts`.

## Deploy to Vercel (region syd1)

```bash
cd proxy
npm run build-index          # writes .data/address-index.json from the CSV (gitignored)
npx vercel link
npx vercel env add MICROBURBS_API_KEY production
npx vercel env add GROUNDTRUTH_CLIENT_TOKEN production
npx vercel --prod
```

`.data/address-index.json` is bundled into the resolve function with `outputFileTracingIncludes` and never committed.
Without it the deploy still works: BUILDING candidates then come only from geocode results.

## Resolver rules (src/lib/resolve.ts)

- OUT_OF_AREA is checked first, against the suburb list, with no API call. A geocode 403 also gives OUT_OF_AREA.
- The query is `unit/number street, suburb`. If no candidate matches the street address for a range like `417-419`, the resolver retries once with `417`.
- **EXACT** needs exactly one GNAF where unit, number, street and suburb all agree. A range also matches its first number but not its last.
  - When the CSV is loaded and has that street address, the unit must be in the CSV too. Otherwise the result is BUILDING.
  - A listing with no unit at an address that has units (from the CSV or geocode) is BUILDING, never EXACT.
- **BUILDING**: the street address matches but the unit is missing or not matched. Candidates are the units at that number, taken from the CSV or else from geocode. If the buyer typed a bedroom count, the list is narrowed with `/basics/all` (at most 30 lookups).
- **CHOOSE**: more than one GNAF passes every check, or the same street name appears with a different street type (St vs Lane).
- **NO_MATCH**: anything else. A wrong home is worse than no match.
- `receipt.csv` is `confirmed`, `not_found` or `not_loaded`. `receipt.query` shows the geocode string that was sent.

## Credits

`src/lib/microburbs.ts` (pacer, 429 retry, cache) and the unit-rewrite idea in `src/lib/normalise.ts` are adapted from the Microburbs hackathon demos, MIT License, Copyright (c) 2026 Microburbs.
