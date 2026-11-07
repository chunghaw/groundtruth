# Groundtruth held-out eval — results

Run: 2026-11-07T00:54:06.496Z · proxy: `http://localhost:3510` · parts mode: `none` · rows: 30 · request errors: 0

## Headline

**False-match rate: 0.0%** (0/30 listings resolved to the wrong home). Target: 0.

| Metric | Value |
|---|---|
| False matches (EXACT but wrong / should not be EXACT) | 0 / 30 (0.0%) |
| EXACT precision (correct EXACT / all EXACT returned) | 100.0% (15 returned) |
| Exact rate (labelled EXACT resolved to EXACT) | 15 / 20 (75.0%) |
| Building-level rate (labelled BUILDING → BUILDING/CHOOSE) | 4 / 5 (80.0%) |
| Out-of-area correctness (labelled OUT_OF_AREA → OUT_OF_AREA) | 4 / 4 (100.0%) |
| In-area wrongly marked OUT_OF_AREA | 0 / 26 |
| Overall agreement with label | 24 / 30 (80.0%) |

## Per pattern

| Pattern | n | Correct | False matches |
|---|---|---|---|
| hidden_address | 1 | 1 (100.0%) | 0 |
| house_plain | 3 | 3 (100.0%) | 0 |
| level_prefix | 1 | 1 (100.0%) | 0 |
| locality_alias | 1 | 1 (100.0%) | 0 |
| missing_street_type | 1 | 1 (100.0%) | 0 |
| number_range | 2 | 2 (100.0%) | 0 |
| number_suffix | 2 | 0 (0.0%) | 0 |
| out_of_area | 4 | 4 (100.0%) | 0 |
| partial_address | 2 | 1 (50.0%) | 0 |
| unit_letter | 4 | 2 (50.0%) | 0 |
| unit_letter_range | 2 | 1 (50.0%) | 0 |
| unit_multi | 1 | 1 (100.0%) | 0 |
| unit_named | 1 | 1 (100.0%) | 0 |
| unit_slash | 1 | 1 (100.0%) | 0 |
| unit_slash_range | 2 | 2 (100.0%) | 0 |
| unit_slash_suffix | 2 | 2 (100.0%) | 0 |

## Failures

| id | Pattern | Displayed address | Expected | Got | Conf | Verdict | Message |
|---|---|---|---|---|---|---|---|
| rea11 | number_suffix | 188A Rochford Street, Erskineville, NSW 2043 | EXACT | NO_MATCH | 0 | MISS (expected EXACT) | Not in the City of Sydney residential address list |
| rea14 | partial_address | 905 South Dowling Street, Zetland, NSW 2017 | BUILDING | NO_MATCH | 0 | MISS (expected BUILDING) | Not in the City of Sydney residential address list |
| dom01 | unit_letter | A10/14 Quarry Master Drive, Pyrmont NSW 2009 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but not unit A10; pick the unit. |
| dom02 | unit_letter | C603/276 Bulwara Road, Ultimo NSW 2007 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but not unit C603; pick the unit. |
| dom03 | number_suffix | 278C Bulwara Road, Ultimo NSW 2007 | EXACT | NO_MATCH | 0 | MISS (expected EXACT) | Not in the City of Sydney residential address list |
| dom04 | unit_letter_range | 303N/16-20 Larkin Street, Camperdown NSW 2050 | EXACT | BUILDING | 60 | MISS (expected EXACT) | Found the building but not unit 303N; pick the unit. |

## All rows

| id | Site | Expected | Got | Conf | G-NAF returned | G-NAF label | Verdict | ms |
|---|---|---|---|---|---|---|---|---|
| rea01 | rea | EXACT | EXACT | 99 | GANSW716627274 | GANSW716627274 | OK | 238 |
| rea02 | rea | EXACT | EXACT | 99 | GANSW710329322 | GANSW710329322 | OK | 51 |
| rea03 | rea | EXACT | EXACT | 80 | GANSW705980792 | GANSW705980792 | OK | 81 |
| rea04 | rea | EXACT | EXACT | 99 | GANSW718118424 | GANSW718118424 | OK | 51 |
| rea05 | rea | BUILDING | BUILDING | 60 |  |  | OK | 132 |
| rea06 | rea | BUILDING | BUILDING | 60 |  |  | OK | 50 |
| rea07 | rea | EXACT | EXACT | 99 | GANSW718497612 | GANSW718497612 | OK | 50 |
| rea08 | rea | EXACT | EXACT | 99 | GANSW717678143 | GANSW717678143 | OK | 46 |
| rea09 | rea | EXACT | EXACT | 99 | GANSW721177313 | GANSW721177313 | OK | 48 |
| rea10 | rea | EXACT | EXACT | 99 | GANSW710502317 | GANSW710502317 | OK | 157 |
| rea11 | rea | EXACT | NO_MATCH | 0 |  | GANSW720785909 | MISS (expected EXACT) | 37 |
| rea12 | rea | EXACT | EXACT | 80 | GANSW704394072 | GANSW704394072 | OK | 120 |
| rea13 | rea | BUILDING | BUILDING | 60 |  |  | OK | 40 |
| rea14 | rea | BUILDING | NO_MATCH | 0 |  |  | MISS (expected BUILDING) | 54 |
| rea15 | rea | OUT_OF_AREA | OUT_OF_AREA | 0 |  |  | OK | 3 |
| dom01 | domain | EXACT | BUILDING | 60 |  |  | MISS (expected EXACT) | 40 |
| dom02 | domain | EXACT | BUILDING | 60 |  |  | MISS (expected EXACT) | 42 |
| dom03 | domain | EXACT | NO_MATCH | 0 |  | GANSW720252905 | MISS (expected EXACT) | 68 |
| dom04 | domain | EXACT | BUILDING | 60 |  |  | MISS (expected EXACT) | 168 |
| dom05 | domain | EXACT | EXACT | 99 | GANSW717014304 | GANSW717014304 | OK | 45 |
| dom06 | domain | EXACT | EXACT | 99 | GANSW721493672 | GANSW721493672 | OK | 47 |
| dom07 | domain | NO_MATCH | NO_MATCH | 0 |  |  | OK | 4 |
| dom08 | domain | EXACT | EXACT | 80 | GANSW704788944 | GANSW704788944 | OK | 49 |
| dom09 | domain | EXACT | EXACT | 75 | GANSW710307290 | GANSW710307290 | OK | 49 |
| dom10 | domain | EXACT | EXACT | 99 | GANSW710316418 | GANSW710316418 | OK | 77 |
| dom11 | domain | EXACT | EXACT | 99 | GANSW705842855 | GANSW705842855 | OK | 57 |
| dom12 | domain | BUILDING | BUILDING | 60 |  |  | OK | 177 |
| dom13 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 |  |  | OK | 2 |
| dom14 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 |  |  | OK | 4 |
| dom15 | domain | OUT_OF_AREA | OUT_OF_AREA | 0 |  |  | OK | 5 |

_Only states, confidences, G-NAF ids and truncated messages are recorded here. No raw API payloads._
