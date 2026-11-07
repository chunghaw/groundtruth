# Groundtruth

**Independent facts about the exact home you're looking at, shown beside the listing.**
Built at the Microburbs hackathon, Sydney, 7 November 2026 (Task 3: browser extension).

- Live demo (web build of the panel on a fictional listing site): https://groundtruth-tawny-one.vercel.app/demo
- Repo: https://github.com/chunghaw/groundtruth
- Report (data, method, what worked, what didn't, held-out check, competitors): [`docs/report.html`](docs/report.html)

## What we built

Groundtruth is a Chrome (Manifest V3) extension for realestate.com.au and domain.com.au listings. It reads one thing from the page, the address. It matches that address to a single home in G-NAF through the Microburbs API, then opens a side panel with facts the listing doesn't show:

- **Verified-home receipt**: what we read, how we normalised it, which checks passed (unit, number, street, suburb) and the G-NAF id. If we can't be sure, we say so and show no facts.
- **What can legally rise next door**: a 3D map of today's buildings, with glass volumes on lots where the planning controls allow at least 2 more storeys than what's there now.
- **Value**: the Microburbs estimate with its 80% range and confidence, checked against a price guide the buyer types in. We never read the guide from the page.
- **Street vs suburb**, **sale history**, **risk overlays**, **strata levy** (units) and agency quoting (when available).
- **30-second spoken briefing** of the facts (ElevenLabs voice, or the browser's own speech as a fallback).

Coverage is the 29 City of Sydney suburbs the hackathon API key covers. Outside them the panel says so and makes no data call.

## Who it helps

Buyers scrolling through listings. The portals show the agent's view of a home. Groundtruth shows independent data about the same home in the same place, and makes clear which home that data belongs to.

## The data

| Source | Used for |
|---|---|
| Microburbs API | Geocode (unit-level G-NAF), the suburb list (`/v1/me`), valuation, sale history, street profile, risks, strata levies, agency quoting, building controls (height and FSR), surrounding parcels, noise and busy roads |
| Organiser address file `flats-city-of-sydney.csv` (G-NAF derived) | Cross-check of every match; 149,880 residential rows indexed (shops, suites, car spaces dropped); units and bedrooms per building |
| OpenStreetMap buildings via OpenFreeMap vector tiles | Today's building footprints and heights for the 3D view |
| The listing page | The displayed address only. Never price, description, photos or agent details |

How often each fact was available, across 45 real homes we looked up: risks, strata levy and building controls 100%; street profile about 90%; priced sale history about 20%; valuation about 13%; agency quoting 0%. The panel puts the most often available facts first and collapses the ones that are missing, so a buyer isn't faced with a wall of "not available".

Public-housing fields are removed in the proxy before anything reaches the panel. They are estimates of where social tenants live, they stigmatise neighbours, and we can't verify them.

## The clever step: never show the wrong home

A wrong home is worse than no answer. Two things make that hard.

**1. The stale page trap.** Both portals keep data from the previous listing in the page after you click to the next one. We saw this live on both sites. An extension that reads that data shows facts for the wrong home. Groundtruth reads the address from the page heading, uses REA's JSON-LD only on a fresh page load (and only when it agrees with the heading), and uses Domain's `__NEXT_DATA__` only when its `listingId` matches the URL. It re-reads on every navigation and drops any reply for a listing you've left.

**2. Messy addresses.** `902/417-419`, `C603/`, `303N/`, `Level 8/1`, `330&330A/8`, `188A`, `Penthouse/`, missing street types and hidden unit numbers. The resolver goes:

normalise → Microburbs geocode (unit-level G-NAF) → cross-check against the organiser address file → one of five states:

- `EXACT`: one home, with unit, number, street and suburb all agreeing. **EXACT needs confirmation from the address file, or a G-NAF record typed 'house' when the listing has no unit.**
- `BUILDING`: we found the building but not the unit. The panel lists the units and can narrow them by the bedroom count the buyer clicks (using the file's bedroom column).
- `CHOOSE`: more than one home fits.
- `NO_MATCH`: we won't guess.
- `OUT_OF_AREA`: outside the 29 suburbs; no API call.

**Held-out check.** We froze 30 real listings (15 REA, 15 Domain) at 10:27, before tuning. Result: **0 of 30 false matches**, 15 of 20 exact homes found, 4 of 5 buildings, 4 of 4 out-of-area. Some of the later rules were chosen while looking at held-out rows, so this result is not fully blind. Details in `docs/report.html` and `eval/`.

## How to run

Needs Node 20+ and Chrome.

```bash
# 1. Proxy (Next.js; holds the Microburbs key)
cd proxy
npm install
cp .env.example .env.local
#   MICROBURBS_API_KEY=...          server only, never shipped to the browser
#   GROUNDTRUTH_CLIENT_TOKEN=...    must match the extension build
#   ADDRESS_CSV_PATH=../data/flats-city-of-sydney.csv   (organiser file, not in the repo)
#   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=...      optional, for the spoken briefing
#   MOCK=1                          optional, fake data with no key
npm test
npm run dev                         # http://localhost:3000

# 2. Extension
cd ../extension
npm install
npm test
GT_PROXY_BASE=http://localhost:3000 GT_CLIENT_TOKEN=<same token> npm run build   # writes extension/dist
```

3. In Chrome open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `extension/dist`.
4. Open a for-sale listing in a City of Sydney suburb on realestate.com.au or domain.com.au.

Held-out eval, with the proxy running:

```bash
GROUNDTRUTH_CLIENT_TOKEN=... node eval/run-eval.mjs     # writes eval/results.md
```

**Security.** The client token built into the extension is a public client identifier, not a secret. The Microburbs key stays on the server, and the proxy is rate-limited (60-request burst, then 120 a minute per IP).

## Sources and credits

- **Microburbs API**: property, street, suburb and planning data, used under the hackathon terms. Microburbs 2026 block figures are estimates.
- **Open G-NAF** © Geoscape Australia, licensed by the Commonwealth of Australia under the Open G-NAF End User Licence Agreement. Attribution required; G-NAF must not be used to send mail to addresses.
- **Organiser address file** (`flats-city-of-sydney.csv`, G-NAF derived): used on the day only. Not republished and not committed.
- **© OpenStreetMap contributors** (ODbL), **OpenMapTiles**, **OpenFreeMap** tiles: building footprints and heights. OSM heights are estimates.
- **MapLibre GL JS** (BSD-3-Clause): 3D map.
- **ElevenLabs** text-to-speech: the spoken briefing.
- **Mapillary** street imagery (CC BY-SA): demo page only, when a token is set.
- **Microburbs hackathon demos** (MIT), https://github.com/Microburbs/microburbs-hackathon-demos: the request pacer, retry and cache in `proxy/src/lib/microburbs.ts` and the unit-rewrite idea in `proxy/src/lib/normalise.ts`.

**Not in this repo:** the organiser data files and any Microburbs API output. Both are git-ignored. The only listing-derived file is `eval/heldout-labels.csv`, which holds public listing URLs and their displayed addresses, nothing else.

realestate.com.au and domain.com.au are trademarks of their owners. Groundtruth is not affiliated with them or with any agency.
