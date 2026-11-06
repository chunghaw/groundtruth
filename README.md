# Groundtruth

**Independent facts about the exact home you're looking at, right on the listing.**
Built at the Microburbs hackathon, Sydney, 7 November 2026.

## What we built

A Chrome extension for realestate.com.au and domain.com.au listings. It reads one thing from the page, the address, and matches it to a single G-NAF home through the Microburbs API. Then it shows facts the listing doesn't:

- **Agency quoting accuracy**: how this agency's past price guides compared with what the homes actually sold for
- **Automated valuation (AVM)** for this home
- **Sale history** of this exact home
- **Street vs suburb**: how this street compares with the rest of the suburb
- **Risk overlays** (TODO: list the overlays the API actually returns)
- **Strata levy** for units

Coverage: the 29 suburbs of the City of Sydney, which is the area the hackathon data covers. Outside that area the extension says so and makes no API call.

## Who it helps

Buyers who are comparing listings and can't tell how the price guide relates to the price, or what the listing leaves out. The portals show the agent's view. Groundtruth shows independent data about the same home, next to the listing.

## Data

| Source | Used for |
|---|---|
| Microburbs Hackathon API | Geocode/address match, AVM, sale history, agent quoting, street profile, risks, strata |
| City of Sydney address file (supplied, G-NAF derived) | Unit lists per street number, for building-level matches |
| ABS Census (TODO: confirm table/year used) | Street and suburb context |

The extension reads **only the address** from the listing page. It never reads or stores price, description, photos or agent details.

## The clever step: never show the wrong home

A wrong home is worse than no answer, so the resolver only returns `EXACT` when unit, number, street and suburb all agree. Anything less becomes `BUILDING` (we found the building, so pick your unit), `CHOOSE` or `NO_MATCH`, each with a receipt that shows what we read and what we checked. Real listings are messy: `902/417-419`, `C603/`, `20E/`, `Level 8/1 Alfred St`, `330&330A/8`, `188A`, `Penthouse/`, missing street types and hidden numbers. Portals are single-page apps, so the extension re-reads the address on every navigation instead of trusting a stale DOM. See `docs/report.html`.

We measure this on a held-out set of 30 real listings (15 REA, 15 Domain) that was frozen before we tuned the resolver. See `eval/`.

## How to run

Requirements: Node 20+ and Chrome.

```bash
# 1. Proxy (holds the API key; the extension never sees it)
cd proxy
npm install
cp .env.example .env.local        # set MICROBURBS_API_KEY, GROUNDTRUTH_CLIENT_TOKEN, ADDRESS_CSV_PATH
npm run dev                       # http://localhost:3000  (MOCK=1 or no key = fake data)

# 2. Extension
cd ../extension
npm install
npm run build                     # outputs extension/dist
```

3. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `extension/dist`.
4. Open any for-sale listing in a City of Sydney suburb on realestate.com.au or domain.com.au.

Held-out eval (with the proxy running):

```bash
GROUNDTRUTH_CLIENT_TOKEN=... node eval/run-eval.mjs      # writes eval/results.md
EVAL_PARTS=hand GROUNDTRUTH_CLIENT_TOKEN=... node eval/run-eval.mjs   # resolver only, hand-parsed parts
```

## Sources & credits

- **Microburbs API**: property, suburb and street data, used under the hackathon terms.
- **Open G-NAF** © Geoscape Australia, licensed by the Commonwealth of Australia under the Open G-NAF End User Licence Agreement. Attribution is required, and G-NAF must not be used to send mail to addresses (mailing restriction).
- **ABS Census** data © Australian Bureau of Statistics, CC BY 4.0.
- **Overture Maps** data, including © OpenStreetMap contributors (ODbL).
- Demo code adapted from [David-Mib/microburbs-hackathon-demos](https://github.com/David-Mib/microburbs-hackathon-demos) (MIT).

**Not in this repo:** the supplied hackathon data files and any Microburbs API output. They are git-ignored and must not be redistributed. The only listing-derived file is `eval/heldout-labels.csv`, which holds public listing URLs and their displayed addresses, nothing else.

realestate.com.au and domain.com.au are trademarks of their owners. Groundtruth is not affiliated with them.
