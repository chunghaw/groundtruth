/**
 * Registers hand-recorded takes (video/out/real/*.mp4) as beat clips in out/<deck>/manifest.json.
 *   node real.ts <deck>      reads shots/<deck>.real.json: { beats: { id: { file, ss, len, crop } } }
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, VIDEO_DIR, deckArg, readJson } from './lib/common.ts';

interface RealShot { readonly file: string; readonly ss: number; readonly len: number; readonly crop?: string }
const deck = deckArg();
const shots = readJson<{ beats: Record<string, RealShot> }>(join(VIDEO_DIR, 'shots', `${deck}.real.json`));
const mPath = join(OUT_DIR, deck, 'manifest.json');
mkdirSync(join(OUT_DIR, deck), { recursive: true });
const manifest: Record<string, unknown> = existsSync(mPath) ? readJson(mPath) : {};
for (const [id, s] of Object.entries(shots.beats)) {
  const file = join(VIDEO_DIR, s.file);
  if (!existsSync(file)) throw new Error(`missing take ${file}`);
  manifest[id] = { kind: 'clip', real: true, concat: file, ss: s.ss, seconds: s.len, crop: s.crop ?? null, warnings: [] };
}
writeFileSync(mPath, JSON.stringify(manifest, null, 2));
console.log(`registered ${Object.keys(shots.beats).length} real takes in ${mPath}`);
