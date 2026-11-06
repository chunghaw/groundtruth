# Groundtruth extension (lane notes)

Chrome MV3 extension. Shows Microburbs facts beside a realestate.com.au / domain.com.au listing.
Reads **only the address** from the page (or what the user types). No API key here: it only calls our proxy.

## Build and load
```bash
cd extension
npm install
npm test            # vitest, 69 tests
npm run build       # esbuild -> dist/
# deployed proxy:
GT_PROXY_BASE=https://groundtruth-proxy.vercel.app GT_CLIENT_TOKEN=<same as proxy env GROUNDTRUTH_CLIENT_TOKEN> npm run build
```
Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/dist`.
After rebuilding, click the reload icon on the extension card, then reload the listing tab.

- Default proxy: `http://localhost:3000` (`src/config.ts`). A different origin must also be added to
  `public/manifest.json` `host_permissions` (localhost:3000 and groundtruth-proxy.vercel.app are already there).
- Client token default `groundtruth-hackathon-2026`. The proxy must use the same value in `GROUNDTRUTH_CLIENT_TOKEN`,
  or rebuild with `GT_CLIENT_TOKEN=...`.

## Layout
- `src/extract/`: pure, unit-tested extractors. `parseAddress.ts` (h1 → parts), `rea.ts` (h1; JSON-LD only on fresh load and only if it agrees; never `ArgonautExchange`), `domain.ts` (`__NEXT_DATA__` componentProps only when `listingId` equals the URL id, else h1; never the slug, never `address-wrapper`), `heading.ts` (first h1 that parses as an address; REA also has a "Your details" h1).
- `src/content/`: `watch.ts` (pushState/replaceState patch, popstate, 1 s poll, throttled MutationObserver, debounce; `CurrentListing` drops stale responses), `panel.ts` + `cards.ts` + `styles.ts` (closed Shadow DOM panel), `content.ts` (glue; waits out the SPA race where the URL changes before the h1).
- `src/background.ts` + `src/lookup.ts` + `src/api.ts`: POST `/api/resolve`, then GET `/api/facts/:gnafId` for EXACT, header `X-Groundtruth-Client`, 8 s timeout, 10-min per-listing cache. Errors come back as `{ok:false, kind:'unreachable'|'http'|'bad-response'}` and the panel shows an error state with Retry / Type address (no endless spinner).
- `src/popup/`: manual address lookup + proxy health line.

## Privacy
The only data sent: `{source, raw (the address heading), parts, bedrooms (buyer-clicked)}`. The guide-price box in
the value card is typed by the buyer and never leaves the page. Permissions: no `tabs`, no `<all_urls>`; the only permission is `tts` (see below).

## Panel states
EXACT (green) → receipt + fact cards: agency quoting (red alert card when underquoter / ≥40%), Microburbs value with 80% range bar and guide compare, last sales, street vs suburb, risk overlays, strata levy, collapsed basics.
BUILDING (amber) → unit list + "How many bedrooms?" 1/2/3/4+ (re-calls resolve with `bedrooms`).
CHOOSE (blue) → candidate list; picking one fetches its facts. NO MATCH (red), OUT OF AREA (grey).
"Wrong home?" opens manual entry in the panel.

## Realistic budget + 30-second briefing
- **Realistic budget** card (right after agency quoting) owns the single guide input; the value card's range bar follows it.
  Pure maths in `src/content/offer.ts`: expected sale ≈ guide × (1 + agency median deviation), cross-checked with the AVM
  80% range. Verdicts: believable / likely low (~+X%) / above our range. AVM-only or agency-only when one is missing;
  agency records with < 3 sales are ignored. The guide is typed by the buyer and never leaves the page.
- **▶ 30-sec briefing** (panel header, once facts load): the background fetches `POST /api/briefing/:gnafId`, passes MP3
  bytes to the content script as base64, which plays them in an `<audio>` from a blob URL with live captions; Stop ends it.
  If the proxy has no ElevenLabs key (JSON reply), or the page blocks audio playback, the script is spoken sentence by
  sentence with `chrome.tts` (web demo: `window.speechSynthesis`).
- **Why `tts`:** `chrome.tts` runs in the service worker, so the fallback voice works on any listing page regardless of
  the page's own media/CSP rules and autoplay state. It grants no access to page data.
