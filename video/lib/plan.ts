/**
 * Prints the edit plan for assemble.sh as TSV:
 *   id  kind(clip|still)  video-src  duration  audio(or -)  caption-png(or -)  crop(or -)
 * Each beat lasts its voiceover + tailPad, so picture and voice stay aligned.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, deckArg, loadDeck, loadVo, readJson } from './common.ts';

const deck = loadDeck(deckArg());
const vo = loadVo(deck.deck);
if (!vo) throw new Error(`out/${deck.deck}/vo.json missing: run node voiceover.ts ${deck.deck}`);
const manifestPath = join(OUT_DIR, deck.deck, 'manifest.json');
const manifest = existsSync(manifestPath) ? readJson<Record<string, { kind: string; concat?: string; seconds?: number; crop?: string | null; ss?: number; real?: boolean }>>(manifestPath) : {};
const MAX_EXTEND_SEC = 3;
const cards = join(OUT_DIR, deck.deck, 'cards');

const rows: string[][] = [];
let total = 0;
if (deck.titleSec > 0) { rows.push(['title', 'still', join(cards, 'title.png'), deck.titleSec.toFixed(3), '-', '-', '-']); total += deck.titleSec; }
for (const b of deck.beats) {
  const v = vo.beats[b.id];
  if (!v) throw new Error(`no voiceover for beat ${b.id}: re-run voiceover.ts`);
  const voDur = v.durationSec + deck.tailPadSec;
  const clipSec = b.still ? 0 : manifest[b.id]?.seconds ?? 0;
  // If on-camera action outran the voice, keep the action (silence fills) up to MAX_EXTEND_SEC.
  const real = !b.still && manifest[b.id]?.real === true;
  // Real takes: show the whole chosen window. Generated clips: follow the voice (+ up to MAX_EXTEND_SEC of action).
  const dur = real ? Math.max(voDur, clipSec) : Math.max(voDur, Math.min(clipSec - 0.6, voDur + MAX_EXTEND_SEC));
  total += dur;
  const cap = join(cards, `caption-${b.id}.png`);
  if (!existsSync(cap)) throw new Error(`missing ${cap}: run node cards.ts ${deck.deck}`);
  if (b.still) {
    rows.push([b.id, 'still', join(cards, `still-${b.still.name}.png`), dur.toFixed(3), v.file, cap, '-']);
    continue;
  }
  const m = manifest[b.id];
  if (!m?.concat || !existsSync(m.concat)) throw new Error(`no capture for beat ${b.id}: run node capture.ts ${deck.deck}`);
  rows.push([b.id, 'clip', m.concat, dur.toFixed(3), v.file, cap, m.crop ?? '-', m.ss !== undefined ? String(m.ss) : '-']);
}
if (deck.endSec > 0) { rows.push(['end', 'still', join(cards, 'end.png'), deck.endSec.toFixed(3), '-', '-', '-']); total += deck.endSec; }
process.stderr.write(`plan: ${rows.length} segments, ${total.toFixed(1)}s (max ${deck.maxTotalSec}s)\n`);
if (total > deck.maxTotalSec) throw new Error(`planned ${total.toFixed(1)}s exceeds ${deck.maxTotalSec}s: shorten voiceover text`);
process.stdout.write(`${rows.map((r) => r.join('\t')).join('\n')}\n`);
process.stdout.write(`#MAX\t${deck.maxTotalSec}\n`);
