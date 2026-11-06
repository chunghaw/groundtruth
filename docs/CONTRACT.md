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
  "message": "human-readable reason when not EXACT" }
```
- EXACT: one home, all checks pass. BUILDING: street address matched but unit missing/unmatched — `candidates` lists units at that street number (from supplied CSV). CHOOSE: several plausible homes. OUT_OF_AREA: suburb not in the 29 City of Sydney suburbs — no Microburbs call made.
- A wrong home is worse than NO_MATCH: only return EXACT when unit+number+street+suburb all agree.

## GET /api/facts/:gnafId
Response: `{ "gnafId", "facts": { "agentQuoting", "avm", "saleHistory", "streetProfile", "risks", "strataLevy", "basics" } }`
Each fact is `{ "available": boolean, "data": <trimmed object> | null, "reason"?: string }`.
`risks` MUST have any public-housing field removed. All facts fetched in parallel, paced ≤ 8 req/s, cached in memory.

## GET /api/health → `{ ok: true, mock: boolean }`
Mock mode (`MOCK=1` or no key): returns deterministic fake data so the extension can be built before the key arrives.
