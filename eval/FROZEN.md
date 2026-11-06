# Held-out set — FROZEN

- Frozen: **2026-11-07 10:27 AEDT** (before any resolver tuning).
- File: `eval/heldout-labels.csv` — 30 rows (15 realestate.com.au, 15 domain.com.au), collected read-only from live for-sale listings on 2026-11-07.
- Only the listing's displayed address (the page `<h1>`) was recorded. No price, description, photos or agent details.
- Expected states: EXACT 20 · BUILDING 5 · OUT_OF_AREA 4 · NO_MATCH 1 (dom07: suburb + street name only).

## Rules
1. Do not add, remove or edit rows, addresses, parts, expected_state or pattern after this point.
2. The only column that may be filled later is `gnaf_id` (11:00+, hand-verified against the API). If hand verification shows a label is wrong (e.g. a number range G-NAF stores as a building), record the correction in the "Label corrections" section below with a reason, rather than silently editing.
3. Do not use these addresses to tune the resolver. Tune on other listings.

## Integrity
SHA-256 of the CSV with the `gnaf_id` column removed (rows joined by `\n`, fields by `,`):
`818e8a3bcca2992c4d1d3816654e983f8109108f45fea08f2f9d6120041aa6ab`

Re-check:
```
python3 -c "import csv,hashlib;r=list(csv.reader(open('eval/heldout-labels.csv',encoding='utf-8')));i=r[0].index('gnaf_id');print(hashlib.sha256('\n'.join(','.join(c for j,c in enumerate(x) if j!=i) for x in r).encode()).hexdigest())"
```

## Label corrections
_None yet._
