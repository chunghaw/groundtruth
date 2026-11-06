# Groundtruth held-out eval — results

Run: 2026-11-06T23:31:31.250Z · proxy: `http://localhost:3000` · parts mode: `none` · rows: 30 · request errors: 0

## Headline

**False-match rate: 6.7%** (2/30 listings resolved to the wrong home). Target: 0.

| Metric | Value |
|---|---|
| False matches (EXACT but wrong / should not be EXACT) | 2 / 30 (6.7%) |
| EXACT precision (correct EXACT / all EXACT returned) | 88.9% (18 returned) |
| Exact rate (labelled EXACT resolved to EXACT) | 16 / 20 (80.0%) |
| Building-level rate (labelled BUILDING → BUILDING/CHOOSE) | 1 / 5 (20.0%) |
| Out-of-area correctness (labelled OUT_OF_AREA → OUT_OF_AREA) | 4 / 4 (100.0%) |
| In-area wrongly marked OUT_OF_AREA | 0 / 26 |
| Overall agreement with label | 22 / 30 (73.3%) |

## Per pattern

| Pattern | n | Correct | False matches |
|---|---|---|---|
| hidden_address | 1 | 1 (100.0%) | 0 |
| house_plain | 3 | 0 (0.0%) | 0 |
| level_prefix | 1 | 0 (0.0%) | 0 |
| locality_alias | 1 | 1 (100.0%) | 0 |
| missing_street_type | 1 | 1 (100.0%) | 0 |
| number_range | 2 | 1 (50.0%) | 0 |
| number_suffix | 2 | 2 (100.0%) | 0 |
| out_of_area | 4 | 4 (100.0%) | 0 |
| partial_address | 2 | 1 (50.0%) | 1 |
| unit_letter | 4 | 4 (100.0%) | 0 |
| unit_letter_range | 2 | 2 (100.0%) | 0 |
| unit_multi | 1 | 0 (0.0%) | 0 |
| unit_named | 1 | 0 (0.0%) | 1 |
| unit_slash | 1 | 1 (100.0%) | 0 |
| unit_slash_range | 2 | 2 (100.0%) | 0 |
| unit_slash_suffix | 2 | 2 (100.0%) | 0 |

## Failures

| id | Pattern | Displayed address | Expected | Got | Conf | Verdict | Message |
|---|---|---|---|---|---|---|---|
| rea03 | house_plain | 19 Alexander Street, Surry Hills, NSW 2010 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but the listing doesn't name a unit; pick the unit. |
| rea05 | level_prefix | Level 8/1 Alfred Street, Sydney, NSW 2000 | BUILDING | NO_MATCH | 0 | MISS (expected BUILDING) | Couldn't read a street number and street name from this address. |
| rea06 | unit_multi | 330&330A/8 Lachlan Street, Waterloo, NSW 2017 | BUILDING | NO_MATCH | 0 | MISS (expected BUILDING) | Couldn't read a street number and street name from this address. |
| rea08 | number_range | 45-49 Ralph Street, Alexandria, NSW 2015 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but the listing doesn't name a unit; pick the unit. |
| rea12 | house_plain | 69 Rose Street, Chippendale, NSW 2008 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but the listing doesn't name a unit; pick the unit. |
| rea13 | unit_named | Penthouse/349 Liverpool Street, Darlinghurst, NSW 2010 | BUILDING | EXACT | 90 | FALSE_MATCH (EXACT on non-exact label) | Matched unit, number, street and suburb. |
| dom08 | house_plain | 23 Ferry Road, Glebe NSW 2037 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but the listing doesn't name a unit; pick the unit. |
| dom12 | partial_address | 30-34 Brougham Street, Potts Point NSW 2011 | BUILDING | EXACT | 90 | FALSE_MATCH (EXACT on non-exact label) | Matched unit, number, street and suburb. |

## All rows

| id | Site | Expected | Got | Conf | Verdict | ms |
|---|---|---|---|---|---|---|
| rea01 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 52 |
| rea02 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 4 |
| rea03 | rea | EXACT | BUILDING | 60 | MISS (expected EXACT) | 8 |
| rea04 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 5 |
| rea05 | rea | BUILDING | NO_MATCH | 0 | MISS (expected BUILDING) | 5 |
| rea06 | rea | BUILDING | NO_MATCH | 0 | MISS (expected BUILDING) | 4 |
| rea07 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 4 |
| rea08 | rea | EXACT | BUILDING | 60 | MISS (expected EXACT) | 6 |
| rea09 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 5 |
| rea10 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 4 |
| rea11 | rea | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 4 |
| rea12 | rea | EXACT | BUILDING | 60 | MISS (expected EXACT) | 3 |
| rea13 | rea | BUILDING | EXACT | 90 | FALSE_MATCH (EXACT on non-exact label) | 5 |
| rea14 | rea | BUILDING | BUILDING | 60 | OK | 4 |
| rea15 | rea | OUT_OF_AREA | OUT_OF_AREA | 0 | OK | 3 |
| dom01 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 2 |
| dom02 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 2 |
| dom03 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 3 |
| dom04 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 3 |
| dom05 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 3 |
| dom06 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 2 |
| dom07 | domain | NO_MATCH | NO_MATCH | 0 | OK | 3 |
| dom08 | domain | EXACT | BUILDING | 60 | MISS (expected EXACT) | 3 |
| dom09 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 2 |
| dom10 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 2 |
| dom11 | domain | EXACT | EXACT | 90 | OK (gnaf_id unlabelled) | 3 |
| dom12 | domain | BUILDING | EXACT | 90 | FALSE_MATCH (EXACT on non-exact label) | 3 |
| dom13 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 | OK | 2 |
| dom14 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 | OK | 2 |
| dom15 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 | OK | 2 |

_Only states, confidences, G-NAF ids and truncated messages are recorded here. No raw API payloads._
