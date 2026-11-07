# Video lane: what the orchestrator / other lanes need to provide

## 1. Panel hooks (extension lane)
The panel is a **closed** shadow root, so Playwright locators can't reach it. `lib/panel.ts` gets in through CDP
(`DOM.describeNode` with `pierce`), so no extension change is needed for what exists today. The shot lists use these
existing selectors. **Please keep them stable** (renaming any of them breaks capture):

| Selector (inside the shadow root) | Used for |
|---|---|
| `.pill.EXACT` / `.pill.BUILDING` / `.pill.OUT_OF_AREA` | deterministic "panel finished" waits |
| `section.receipt`, `section.receipt dl dd:nth-of-type(n)` | match receipt beats |
| `section[aria-label='Agency quoting accuracy']` + `.big` | underquote hero |
| `section[aria-label='Microburbs value']` | value / offer ceiling |
| `#gt-guide` (new offer card) or `input[aria-label='Guide price you were quoted']`, `.offer-pill` / `.guide-verdict.below` | typing the guide |
| `section[aria-label='Realistic budget']` | offer ceiling card (new) |
| `button.brief-btn`, `.brief-cap span.now` | spoken briefing (in `briefing.ts`, not yet on the deployed /demo) |
| `section[aria-label='Last sales' / 'Street vs suburb' / 'Risk overlays']` | facts scroll |
| `section[aria-label='Narrow down the unit']`, `.beds button:nth-child(2)`, `.beds button[aria-pressed='true']`, `ul.units li button` | hidden unit + bedrooms |
| `button.link` ("Wrong home?") | receipt beat |

**Needed: hooks for features not in `extension/src` yet** (beat d09 is marked; d10 also waits on `.brief-btn`, both are `optional` and will show an
empty shot until these exist):

| Proposed hook | Element |
|---|---|
| `[data-gt='next-door-3d-open']` | button that opens the 3D "what can legally rise next door" view |
| `[data-gt='next-door-3d']` | the 3D canvas/container, visible once it has rendered (add it only after the first frame is drawn) |

## 2. Real listing URLs (orchestrator, before 13:45)
Fill the `vars` block in `shots/demo.live.json` and `shots/pitch.live.json` (capture refuses to run while `REPLACE_ME` is left):
- `REA_EASY_URL`: realestate.com.au listing that resolves EXACT, ideally an agency with a high underquote rate
- `DOMAIN_UNIT_URL`: domain.com.au unit listing with a messy heading (still EXACT)
- `DOMAIN_SWITCH_LINK`: CSS selector of an in-page link on that Domain page to a second listing (e.g. `a[href*='2019876543']`)
- `REA_BUILDING_URL`: listing with the unit number hidden (BUILDING state)
- `REA_OOA_URL`: listing outside City of Sydney (e.g. Parramatta)

Capture never clicks consent, sign-in or enquiry. If a cookie banner or bot wall appears, it stops: re-run with `--target demo`.
Tip: run once headed and browse the sites by hand in that window first (profile persists in `.cache/profile-live`).

## 3. Extension build pointing at the deployed proxy
`extension/dist` currently calls `http://localhost:3000`. For capture, either run the proxy locally (`cd proxy && npm run dev`)
or rebuild with `GT_PROXY_BASE=<deployed origin>`. Note: `public/manifest.json` host_permissions lists
`groundtruth-proxy.vercel.app`, not `groundtruth-tawny-one.vercel.app`. Add whichever origin is used.

## 4. ElevenLabs key
`proxy/.env.local` has no `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` yet, so voiceover falls back to macOS `say` (placeholder).
Add both lines there (optional `ELEVENLABS_MODEL_ID`, default `eleven_multilingual_v2`), then re-run `node voiceover.ts <deck>`.

## 5. ffmpeg
Not installed. Run `brew install ffmpeg`. The pipeline needs only `overlay`, `concat`, `loudnorm` and `libx264` (or
`h264_videotoolbox`). Captions are pre-rendered PNGs, so it doesn't need libass or freetype.

## 6. Final accuracy numbers
`scripts/numbers.json` holds DRAFT values from `eval/results.md`. Update after the final run (including the `*Spoken` variants).
