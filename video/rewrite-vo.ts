/**
 * Rewrites voiceover lines with GPT (gpt-4.1, temp 0.6) so they sound natural, keeping every fact.
 * Validation: same numeric values (digits or spoken words), no new numbers, word count within ±15%.
 * Failed rewrites keep the original. Originals are kept in `voText_orig`.
 *
 *   node rewrite-vo.ts [pitch demo]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_DIR, VIDEO_DIR, loadEnvFile } from './lib/common.ts';
import { numbersIn } from './lib/numbers.ts';

const SYSTEM = "You rewrite voiceover lines for a 45-second hackathon pitch and a 3-minute product demo of Groundtruth, a Chrome extension for Sydney home buyers built on the Microburbs API. Make each line sound like a confident, warm founder talking naturally to judges: contractions, varied rhythm, plain words, a little energy, no hype words (revolutionary, game-changer), no clichés, no questions to the audience. Keep EVERY fact and number exactly (you may spell numbers as spoken words). Keep these terms when present: Chrome extension, address match, Microburbs API, buyer, G-NAF, realestate.com.au, Domain. Keep the line within ±10% of the original word count so the timing still fits. Return only the line.";
const SKIP = new Set(['r07-briefing']);
const KEEP_TERMS = ['Chrome extension', 'address match', 'Microburbs API', 'buyer', 'G-NAF', 'realestate.com.au', 'Domain'];

const env = { ...loadEnvFile(join(REPO_DIR, 'proxy', '.env.local')), ...process.env };
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY missing (proxy/.env.local)');

const words = (s: string) => s.trim().split(/\s+/).length;
const key = (ns: number[]) => [...new Set(ns.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b).join(',');

function validate(orig: string, next: string): string | null {
  const a = key(numbersIn(orig)), b = key(numbersIn(next));
  if (a !== b) return `numbers differ: [${a}] vs [${b}]`;
  const r = words(next) / words(orig);
  if (r < 0.85 || r > 1.15) return `length ratio ${r.toFixed(2)}`;
  for (const t of KEEP_TERMS) if (orig.includes(t) && !next.includes(t)) return `dropped term "${t}"`;
  return null;
}

async function rewrite(line: string, prev: string | undefined, next: string | undefined, deck: string): Promise<string> {
  const user = [`Video: ${deck === 'pitch' ? '45-second pitch' : '3-minute demo'}.`,
    prev ? `Previous line (context only): ${prev}` : 'This is the first line.',
    next ? `Next line (context only): ${next}` : 'This is the last line.',
    `Rewrite this line (${words(line)} words):`, line].join('\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4.1', temperature: 0.6, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices[0].message.content.trim().replace(/^["“]|["”]$/g, '');
}

interface RawBeat { id: string; vo: string; voText_orig?: string; [k: string]: unknown }

for (const deck of process.argv.slice(2).length ? process.argv.slice(2) : ['pitch', 'demo']) {
  const path = join(VIDEO_DIR, 'scripts', `${deck}.beats.json`);
  const data = JSON.parse(readFileSync(path, 'utf8')) as { beats: RawBeat[] };
  const origs = data.beats.map((b) => b.voText_orig ?? b.vo);
  const beats = await Promise.all(data.beats.map(async (b, i) => {
    if (SKIP.has(b.id) || b.audio) return b;
    const orig = origs[i];
    try {
      const cand = await rewrite(orig, origs[i - 1], origs[i + 1], deck);
      const err = validate(orig, cand);
      console.log(`${deck}/${b.id}: ${err ? `KEPT ORIGINAL (${err})` : 'rewritten'}\n  - ${orig}\n  + ${err ? orig : cand}`);
      return { ...b, voText_orig: orig, vo: err ? orig : cand };
    } catch (e) {
      console.log(`${deck}/${b.id}: KEPT ORIGINAL (${(e as Error).message})`);
      return { ...b, voText_orig: orig, vo: orig };
    }
  }));
  writeFileSync(path, JSON.stringify({ ...data, beats }, null, 2) + '\n');
}
