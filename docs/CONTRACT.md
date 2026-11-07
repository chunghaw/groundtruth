# Extension ⇄ Proxy contract (v1)

Proxy base URL: configured in `extension/src/config.ts` (`PROXY_BASE`), default `http://localhost:3000`.
Every request from the extension sends header `X-Groundtruth-Client: <shared token from env GROUNDTRUTH_CLIENT_TOKEN>`.
The proxy rejects requests without it (401). The Microburbs key lives ONLY in the proxy env `MICROBURBS_API_KEY`.

## POST /api/resolve
Request (address parts as read from the page — nothing else from the listing):
```json
{ "source": "rea" | "domain" | "manual",
  "raw": "902/417-419 Bourke Street, Surry Hills, NSW 2010",
  "parts": { "unit": "902", "number": "417-419", "street": "Bourke Street",
             "suburb": "Surry Hills", "state": "NSW", "postcode": "2010" } | null,
  "bedrooms": 2 | null }            // only when the BUYER typed it (unit narrowing)
```
Response:
```json
{ "state": "EXACT" | "BUILDING" | "CHOOSE" | "NO_MATCH" | "OUT_OF_AREA",
  "confidence": 0-100,
  "gnafId": "GANSW..." | null,
  "receipt": { "read": "...", "normalised": "U902 · 417-419 · BOURKE ST · SURRY HILLS",
               "checks": { "unit": true, "number": true, "street": true, "suburb": true },
               "geocodeCandidates": 10 },
  "candidates": [ { "gnafId": "...", "label": "902/417-419 Bourke Street, Surry Hills", "bedrooms": 2 | null } ],
  "location": { "lat": -33.88, "lng": 151.21 } | null,   // optional, additive (v1.1)
  "message": "human-readable reason when not EXACT" }
```
- `location` (optional): EXACT → the matched home's coordinates; BUILDING → the building's, both from the supplied address CSV. Absent/null when the CSV has no row for it — clients centre the 3D view on it when present.
- `candidates[].bedrooms` comes from the supplied CSV when known; a buyer-typed `bedrooms` narrows BUILDING candidates locally (no extra API calls).
- EXACT: one home, all checks pass. BUILDING: street address matched but unit missing/unmatched — `candidates` lists units at that street number (from supplied CSV). CHOOSE: several plausible homes. OUT_OF_AREA: suburb not in the 29 City of Sydney suburbs — no Microburbs call made.
- A wrong home is worse than NO_MATCH: only return EXACT when unit+number+street+suburb all agree.

## GET /api/facts/:gnafId
Response: `{ "gnafId", "facts": { "agentQuoting", "avm", "saleHistory", "streetProfile", "risks", "strataLevy", "basics" } }`
Each fact is `{ "available": boolean, "data": <trimmed object> | null, "reason"?: string }`.
`risks` MUST have any public-housing field removed. All facts fetched in parallel, paced ≤ 8 req/s, cached in memory.

## GET /api/health → `{ ok: true, mock: boolean }`
Mock mode (`MOCK=1` or no key): returns deterministic fake data so the extension can be built before the key arrives.

## POST /api/briefing/:gnafId
Body (optional): `{ "context3d"?: object }`. If absent, the proxy looks up the 3D context itself (≤ 4 s, optional).
- `ELEVENLABS_API_KEY` set and TTS succeeds → `200 audio/mpeg`, the spoken script URI-encoded in `X-Briefing-Script` (exposed to CORS).
- Otherwise → `200 { "script": string, "audio": null }`; the client speaks it with browser TTS.
Script: ≤ 75 words, numbers spoken as words ("about one point one million"): value range, agency quoting honesty,
what can rise nearby (if 3D data), top risk overlay, strata levy (units). Same token gate + rate limit as other routes;
uncached voice synthesis has its own tighter bucket. Audio cached in memory by gnafId + script hash.

## GET /api/context3d/:gnafId  ("What can rise next door" 3D card)
Same auth gate as /api/facts. Cached in memory per GNAF for 1 h. Coordinates rounded to 6 dp; overlays clipped to a ±200 m box.
```json
{ "gnafId": "GANSW...", "available": true, "center": [lng, lat], "radiusM": 200,
  "lots": { "type": "FeatureCollection", "features": [ { "geometry": Polygon|MultiPolygon,
     "properties": { "gnafId": "...", "isSubject": false, "maxHeightM": 45 | null,
                     "source": "hob" | "fsr-estimate" | "none", "fsr": 3 | null, "storeys": 14 | null } } ] },
  "noise": FeatureCollection<{color, opacity}> | null, "busyRoads": FeatureCollection<{roadClass}> | null,
  "subject": { "maxHeightM": 12, "storeys": 4, "source": "hob" } | null,
  "tallestNeighbour": { "maxHeightM": 45, "storeys": 14, "source": "hob", "distanceM": 58, "direction": "west" } | null,
  "heightSource": "hob" | "fsr-estimate" | "mixed" | "none", "notes": ["..."] }
```
Height per lot = HOB polygon containing the lot centroid. No HOB: FSR fallback `height = FSR ÷ 0.5 site cover × 3.2 m/storey` (cap 80 m), `source: "fsr-estimate"`, labelled "estimated from FSR". Storeys = round(h / 3.2).
Upstream: `/v1/properties/{g}/surroundings/parcels`, `/v1/properties/{g}/profile` (suburb), `/v1/suburbs/{s}/development/building-controls`, `/v1/suburbs/{s}/shapes/noise-heatmap?geojson=true`, `/v1/suburbs/{s}/shapes/busy-roads?geojson=true`. All shape parsing is in `proxy/src/lib/context3d.ts` `parse*`.
