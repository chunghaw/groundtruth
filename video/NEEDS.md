# Video lane: what the orchestrator / other lanes need to provide

## 1. Panel hooks (extension lane)
The panel is a **closed** shadow root, so Playwright locators can't reach it. `lib/panel.ts` gets in through CDP
(`DOM.describeNode` with `pierce`), so no extension change is needed for what exists today. The shot lists use these
existing selectors. **Please keep them stable** (renaming any of them breaks capture):

| Selector (inside the shadow root) | Used for |
|---|---|
| `.pill.EXACT` / `.pill.BUILDING` / `.pill.OUT_OF_AREA` | deterministic "panel finished" waits |
| `section.receipt button.strip`, `section.receipt.open`, `section.receipt .rbody dd:nth-of-type(n)`, `dd.checks` | Verified home strip → receipt |
| `section.card.c3`, `.c3-lead` (loaded), `.c3-stage`, `.c3-segs button.c3-seg` | 3D next door |
| `section[aria-label='Risk overlays' / 'Strata levy (suburb median)' / 'Microburbs value']` | facts (optional) |
| `section[aria-label='Narrow down the unit']`, `.beds button:nth-child(2)`, `.beds button[aria-pressed='true']`, `ul.units li button` | hidden unit |
| `button.brief-btn`, `.brief-cap span.now` | 30-s briefing |

Agency quoting is no longer featured. Re-check these after the polish lane's reorder (~12:50).
Demo-page fallback uses preset ids `live-exact-unit`, `live-exact-house`, `live-building`, `live-out-of-area` (vars in `shots/*.demo.json`). **The deployed /demo still serves the old mock ids**, so fallback capture of pitch/demo fails until it's redeployed.

## 2. Real listing URLs (orchestrator, before 13:45)
Fill the `vars` block in `shots/demo.live.json` and `shots/pitch.live.json` (capture refuses to run while `REPLACE_ME` is left):
- `REA_UNIT_URL` (REA unit, e.g. 902/417-419 Bourke St), `DOMAIN_URL` + `DOMAIN_SWITCH_LINK` (CSS selector of an in-page link to a 2nd listing), `REA_BUILDING_URL` (417-419 Bourke St, unit hidden), `REA_BONDI_URL`

Capture never clicks consent, sign-in or enquiry. If a cookie banner or bot wall appears, it stops: re-run with `--target demo`.
Tip: run once headed and browse the sites by hand in that window first (profile persists in `.cache/profile-live`).

## 3. Extension build pointing at the deployed proxy
`extension/dist` currently calls `http://localhost:3000`. For capture, either run the proxy locally (`cd proxy && npm run dev`)
or rebuild with `GT_PROXY_BASE=<deployed origin>`. Note: `public/manifest.json` host_permissions lists
`groundtruth-proxy.vercel.app`, not `groundtruth-tawny-one.vercel.app`. Add whichever origin is used.

## 4. ElevenLabs
Key read from `proxy/.env.local`; voice defaults to George (`JBFqnCBsd6RMkjVDRZzb`) unless `ELEVENLABS_VOICE_ID` is set.

## 5. ffmpeg
Not installed. Run `brew install ffmpeg`. The pipeline needs only `overlay`, `concat`, `loudnorm` and `libx264` (or
`h264_videotoolbox`). Captions are pre-rendered PNGs, so it doesn't need libass or freetype.

## 6. Final accuracy numbers
`scripts/numbers.json`: `exactRate` and `outOfArea` are TBD (VO currently says "most" / "every"); next-door numbers are 2 lots / 4–5 storeys. Update, then re-run voiceover + cards.
