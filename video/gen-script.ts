/**
 * Generates pitch + demo beats with OpenAI (gpt-5, fallback gpt-4.1) from real on-screen facts.
 * Validates that every number used comes from FACTS; retries once, otherwise fails loudly.
 * Writes scripts/pitch.beats.json and scripts/demo.beats.json (old ones are in scripts/backup/).
 *
 *   node gen-script.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR, VIDEO_DIR, loadEnvFile } from './lib/common.ts';
import { numbersIn } from './lib/numbers.ts';

const env = { ...loadEnvFile(join(REPO_DIR, 'proxy', '.env.local')), ...process.env };
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY missing (proxy/.env.local)');

const SHOTS: Record<string, string> = {
  's1:price': 'REA 313/6 Belvoir St, Surry Hills: panel top shows "What it should sell for: about $832k" vs "Microburbs value $785k" and the gap line (+$46k, 6%).',
  's1:receipt': 'Same listing: clicking "Verified home" expands the address match receipt (address read, normalised, G-NAF id, 4/4 checks).',
  's1:agency': 'Same listing: agency card "7 of 10 of this agency\'s recent sales sold above their guide", McGrath Surry Hills, median +3.9%.',
  's1:guide': 'Same listing: buyer types a $900k guide; panel says it differs from the $800k guide on record and sits 15% above Microburbs\' $785k estimate.',
  's6:switch': 'REA in-page navigation: search results -> 18/251-263 Goulburn St (about $1.3m) -> back -> 902/417-419 Bourke St; the receipt updates to the new home.',
  's7:domain': 'domain.com.au 405/82-92 Cooper St, Surry Hills: panel shows an exact address match.',
  's7:briefing': 'Same Domain listing: the 30-second spoken briefing plays (real recorded audio, captions in the panel). No narration over it: vo must be "".',
  's3d': 'REA 902/417-419 Bourke St: verdict "2 lots within 100 m could rise 4-5 more storeys", 3D map of the home tower with glass headroom volumes.',
  'feat:street': 'REA 902/417-419 Bourke St: Street vs suburb card: growth forecast 3.4% vs 3.6%/yr (street vs suburb), past growth 2.4% vs 2.6%, renters 41% vs 58%, "Mid-pack".',
  'feat:risks': 'Same listing: Risk overlays card: bushfire clear; flood not on property (nearest 443 m); heritage ON property ("Heritage controls may limit renovations"); HV power line nearest 35 m.',
  'feat:strata': 'Same listing: Strata levy card: $5,320 a year, $1,330 a quarter, Surry Hills median across 97 buildings.',
  'layers': '3D map with the Noise and Busy roads layer toggles switched on (falls back to s3d if the clip is missing).',
};

const FACTS = `
Product: Groundtruth, a Chrome extension. On a realestate.com.au or domain.com.au listing it reads ONLY the address, matches it to the exact home in G-NAF (the national address file) and shows a visible address match receipt. Then it shows Microburbs API facts for that exact home. City of Sydney (29 suburbs) only. Data comes from the Microburbs API.
Features (all real, all on screen): likely sale price vs Microburbs value and the gap; the agency's guide-vs-sold record; verified address-match receipt (G-NAF id, 4/4 checks); street vs suburb growth; risk overlays (heritage, flood, HV power line distance); 3D "what can legally rise next door" with Noise and Busy roads layers; strata levy; a typed-guide check (the guide never leaves the page); a 30-second spoken briefing; works when realestate.com.au switches listings in place; works on Domain.
Hackathon: Microburbs hackathon, Sydney, Task 3 (Chrome extension). Judges open real listings and check the address match and that the facts belong to the right home. An AI first pass picks the top 25 pitch videos. "A clever, non-obvious step beats polish."
Audience: Microburbs judges, plus a property-extension founder with 52k users.
Proof: tested on 30 held-out real listings, 0 wrong homes.
On-screen values you may use (use NO other numbers):
- 313/6 Belvoir St: likely sale about $832k; Microburbs value $785k; gap about $46k (6%); McGrath: 7 of 10 recent sales sold above guide, median +3.9%. Typed guide $900k vs $800k on record, 15% above Microburbs' estimate.
- 902/417-419 Bourke St: 2 lots within 100 m could rise 4-5 more storeys; street vs suburb: growth forecast 3.4% vs 3.6%/yr, past growth 2.4% vs 2.6%, renters 41% vs 58%; heritage on property; flood nearest 443 m (not on property); HV power line nearest 35 m; strata levy $5,320 a year ($1,330 a quarter, Surry Hills median, 97 buildings).
- 18/251-263 Goulburn St: about $1.3m.
- 405/82-92 Cooper St on Domain: exact match. 30-second briefing.
`;

const ALLOWED = new Set([313, 6, 832, 832000, 785, 785000, 46, 46000, 7, 10, 3.9, 900, 900000, 800, 800000, 15, 902, 417, 419, 2, 100, 4, 5, 5320, 3.4, 3.6, 18, 251, 263, 1.3, 1300000, 405, 82, 92, 30, 0, 29, 52, 52000, 25, 3, 1, 2010, 45, 2.4, 2.6, 41, 58, 443, 35, 1330, 97]);

const ASK = `${FACTS}
Footage you can use (shot ids): ${Object.entries(SHOTS).map(([k, v]) => `\n- ${k}: ${v}`).join('')}

Write two scripts in a natural, warm, confident founder voice. Plain words, contractions, varied rhythm, no hype words, no clichés, no questions to the audience. Every number must come from the on-screen values above (spell numbers as spoken words in vo, digits in captions). Say "Chrome extension", "address match", "Microburbs API" and "buyer" aloud somewhere in each script. A narrated line must describe what its shot shows.
(a) "pitch": 6-7 beats, at most 105 words of narration in total (it must fit 42 seconds): hook, the problem buyers have, 3-4 fast feature beats, one proof line ("tested on 30 real listings, 0 wrong homes"), close with "Built on the Microburbs API" and the name Groundtruth.
(b) "demo": about 12 beats, at most 380 words of narration in total (it must fit 170 seconds including a 27-second briefing with vo ""), touring the features on real listings. Put the proof line inside a feature beat's caption, not a slide.
Captions: short key phrases, at most 9 words, may use [[word]] to highlight one phrase.
Return JSON only: {"pitch":[{"id","vo","caption","shot"}...],"demo":[...]}. ids like "p1-hook", "d01-price". shot must be one of the shot ids.`;

interface GenBeat { id: string; vo: string; caption: string; shot: string }

async function call(model: string): Promise<{ pitch: GenBeat[]; demo: GenBeat[] }> {
  const body: Record<string, unknown> = { model, messages: [{ role: 'user', content: ASK }], response_format: { type: 'json_object' } };
  if (model.startsWith('gpt-4')) body.temperature = 0.6;
  const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(json.choices[0].message.content);
}

function problems(out: { pitch: GenBeat[]; demo: GenBeat[] }): string[] {
  const errs: string[] = [];
  for (const [deck, beats] of Object.entries(out) as Array<[string, GenBeat[]]>) {
    if (!Array.isArray(beats) || !beats.length) { errs.push(`${deck}: no beats`); continue; }
    for (const b of beats) {
      if (!(b.shot in SHOTS)) errs.push(`${deck}/${b.id}: unknown shot ${b.shot}`);
      for (const n of [...numbersIn(b.vo ?? ''), ...numbersIn(b.caption ?? '')]) if (!ALLOWED.has(Math.round(n * 1000) / 1000)) errs.push(`${deck}/${b.id}: number ${n} not in facts`);
    }
    const words = beats.reduce((s, b) => s + (b.vo ? b.vo.split(/\s+/).length : 0), 0);
    if (words > (deck === 'pitch' ? 112 : 400)) errs.push(`${deck}: ${words} words, too long`);
  }
  return errs;
}

async function generate(): Promise<{ pitch: GenBeat[]; demo: GenBeat[] }> {
  let last: string[] = [];
  for (const model of ['gpt-5', 'gpt-5', 'gpt-4.1']) {
    try {
      const out = await call(model);
      last = problems(out);
      if (!last.length) { console.log(`generated with ${model}`); return out; }
      console.warn(`${model}: rejected: ${last.join('; ')}`);
    } catch (e) { console.warn((e as Error).message); }
  }
  throw new Error(`no valid script: ${last.join('; ')}`);
}

const toBeat = (b: GenBeat) => ({
  id: b.id, window: '', maxSec: Math.ceil((b.vo ? b.vo.split(/\s+/).length : 0) / 2.6) + 2, vo: b.vo || '(recorded briefing audio)', caption: b.caption, action: SHOTS[b.shot], shot: b.shot,
  ...(b.shot === 's7:briefing' ? { audio: 'out/real/brief-cooper.mp3' } : {}),
});

const out = await generate();
writeFileSync(join(VIDEO_DIR, 'scripts', 'pitch.beats.json'), JSON.stringify({ deck: 'pitch', title: 'Groundtruth: 45-second pitch', maxTotalSec: 45, titleSec: 0, endSec: 1.5, tailPadSec: 0.2, beats: out.pitch.map(toBeat) }, null, 2) + '\n');
writeFileSync(join(VIDEO_DIR, 'scripts', 'demo.beats.json'), JSON.stringify({ deck: 'demo', title: 'Groundtruth: demo', maxTotalSec: 180, titleSec: 2.5, endSec: 3.0, tailPadSec: 0.3, beats: out.demo.map(toBeat) }, null, 2) + '\n');
for (const d of ['pitch', 'demo'] as const) for (const b of out[d]) console.log(`${b.id} [${b.shot}] ${b.vo}\n    caption: ${b.caption}`);
