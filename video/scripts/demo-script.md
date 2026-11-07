# Groundtruth: 3-minute demo

Generated from `scripts/demo.beats.json` by `node build-scripts.ts`. Edit the JSON, not this file.
Timings: measured voiceover (say). Budget 180 s.

**0:00.0 Title card** (2.5 s): Groundtruth · Chrome extension · built on the Microburbs API

## 0:02.5–0:13.0 · d01-rea-open (planned 0:03-0:15, VO budget 12 s)

- **Voiceover:** This is Groundtruth, a Chrome extension for home buyers. Open a realestate.com.au listing and the panel slides in beside it. It reads only the address, nothing else on the page.
- **On screen:** Easy REA listing loads; panel appears and turns green (Exact).
- **Caption:** **Chrome extension** · reads only the listing's address

## 0:13.0–0:24.3 · d02-receipt (planned 0:15-0:28, VO budget 13 s)

- **Voiceover:** First, the address match receipt: what it read, where it read it from, the normalised address, and the exact G-NAF home, with every check shown. Wrong home? One click and you type it.
- **On screen:** Cursor walks down the receipt rows; hovers 'Wrong home?'.
- **Caption:** **Address match** receipt: read → normalised → exact G-NAF home

## 0:24.3–0:37.3 · d03-facts (planned 0:28-0:42, VO budget 14 s)

- **Voiceover:** Then the data, from the Microburbs API. The hero is this agency's underquoting rate: how often their sales beat the advertised guide. Then the value range, sale history, street versus suburb, and risks.
- **On screen:** Scroll through Agency quoting accuracy → Microburbs value → Last sales → Street vs suburb → Risk overlays.
- **Caption:** Live **Microburbs API** data: agency underquoting, value, sales, street, risks

## 0:37.3–0:45.4 · d04-offer (planned 0:42-0:53, VO budget 11 s)

- **Voiceover:** Type the guide the agent gave you. Groundtruth places it on the value range and tells the buyer whether it sits below, so you know your real offer ceiling.
- **On screen:** Type "$1.1m" into the guide box; dashed guide marker and verdict appear.
- **Caption:** Your guide vs the 80% range → realistic **offer ceiling** (never leaves the page)

## 0:45.4–0:55.8 · d05-domain-unit (planned 0:53-1:05, VO budget 12 s)

- **Voiceover:** Domain listings are messier. This unit's heading is formatted differently, but the address match still lands on the exact unit, read from Domain's page data and checked against the listing ID.
- **On screen:** Domain unit listing loads; receipt shows 'page data (id-matched)'.
- **Caption:** Messy Domain unit → still the exact unit (**address match** by listing ID)

## 0:55.8–1:03.8 · d06-spa-switch (planned 1:05-1:16, VO budget 11 s)

- **Voiceover:** Domain also swaps listings without reloading. A late answer for the old listing is dropped, so you never see the last home's numbers on this one.
- **On screen:** Click a similar listing (in-page navigation); panel re-reads the new address.
- **Caption:** In-page listing switch: stale answers are **dropped**, never shown

## 1:03.8–1:12.7 · d07-hidden-unit (planned 1:16-1:29, VO budget 13 s)

- **Voiceover:** Some listings hide the unit number. Groundtruth won't guess. It lists the units in the building and asks how many bedrooms. Tap two, and the list narrows.
- **On screen:** Building listing → amber 'Building' state → tap 2 → unit list narrows → pick a unit.
- **Caption:** Hidden unit: no guessing. Tap **bedrooms** to narrow the building

## 1:12.7–1:18.2 · d08-out-of-area (planned 1:29-1:36, VO budget 7 s)

- **Voiceover:** Outside the City of Sydney pilot area, it says so plainly, and makes no data call at all.
- **On screen:** Parramatta listing → grey 'Out of area' state.
- **Caption:** Out of area: said plainly, **no data call**

## 1:18.2–1:28.3 · d09-next-door (planned 1:36-1:49, VO budget 13 s)

- **Voiceover:** Now the part listings never show: what can legally rise next door. The 3D view raises each neighbouring lot to its planning height limit, so a buyer sees whether that view is protected.
- **On screen:** Open the 3D next-door view and orbit slowly.
- **Caption:** 3D: what can **legally rise next door** (planning height limits)

## 1:28.3–1:33.4 · d10-briefing (planned 1:49-1:56, VO budget 8 s)

- **Voiceover:** At an inspection? Press play for a thirty-second spoken briefing of everything on the panel.
- **On screen:** Press the briefing play button; captions follow the audio.
- **Caption:** 30-second spoken **briefing**

## 1:33.4–1:44.9 · d11-accuracy (planned 1:56-2:10, VO budget 14 s)

- **Voiceover:** Does the address match hold up? We froze 30 real listings before testing. Exact-home precision was eighty-nine percent, every out-of-area listing was caught, and we report the two wrong matches openly.
- **On screen:** Accuracy table slide. _(slide: accuracy-demo)_
- **Caption:** Held-out: 88.9% exact precision · 4 of 4 out-of-area · 2 of 30 wrong

## 1:44.9–1:55.6 · d12-limits (planned 2:10-2:22, VO budget 12 s)

- **Voiceover:** Limits. City of Sydney's twenty-nine suburbs only, for now. The value is a Microburbs estimate, not a valuation. And when a listing hides the address entirely, you type it.
- **On screen:** Limits slide. _(slide: limits)_
- **Caption:** Limits, stated plainly

## 1:55.6–2:00.7 · d13-close (planned 2:22-2:28, VO budget 7 s)

- **Voiceover:** Groundtruth. Built on the Microburbs API, ready for any property extension.
- **On screen:** Back on the first listing with the panel open; end card follows.
- **Caption:** Built on the **Microburbs API** · ready for any property extension

**2:00.7 End card** (3 s): Groundtruth · Built on the Microburbs API · github.com/chunghaw/groundtruth

**Total ≈ 2:03.7** (limit 3:00.0)
