/** Shared paths, deck loading and placeholder filling for the video pipeline. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIDEO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = resolve(VIDEO_DIR, '..');
export const OUT_DIR = join(VIDEO_DIR, 'out');
export const CACHE_DIR = join(VIDEO_DIR, '.cache');
export const EXTENSION_DIST = join(REPO_DIR, 'extension', 'dist');

export interface StillSpec {
  readonly name: string;
  readonly heading: string;
  readonly rows?: ReadonlyArray<readonly [string, string]>;
  readonly bullets?: readonly string[];
  readonly note?: string;
}

export interface Beat {
  readonly id: string;
  readonly window: string;     // planned slot, e.g. "0-5 s"
  readonly maxSec: number;     // budget for the voiceover of this beat
  readonly vo: string;         // voiceover text (also printed in the script)
  readonly tts?: string;       // optional pronunciation override sent to TTS
  readonly caption: string;    // on-screen caption; [[word]] is highlighted
  readonly action: string;     // human description of what is on screen
  readonly still?: StillSpec;  // render a slide instead of a screen capture
}

export interface Deck {
  readonly deck: string;
  readonly title: string;
  readonly maxTotalSec: number;
  readonly titleSec: number;
  readonly endSec: number;
  readonly tailPadSec: number;
  readonly beats: readonly Beat[];
}

export function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`Could not read JSON ${path}: ${(e as Error).message}`);
  }
}

export function loadNumbers(): Record<string, string> {
  const raw = readJson<Record<string, unknown>>(join(VIDEO_DIR, 'scripts', 'numbers.json'));
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, String(v)]));
}

/** Replace {{key}} placeholders. Unresolved keys are collected in `missing`. */
export function fill(text: string, vars: Record<string, string>, missing: Set<string> = new Set()): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    if (k in vars) return vars[k];
    missing.add(k);
    return `{{${k}}}`;
  });
}

function fillStill(s: StillSpec, vars: Record<string, string>, missing: Set<string>): StillSpec {
  return {
    ...s,
    heading: fill(s.heading, vars, missing),
    rows: s.rows?.map(([a, b]) => [fill(a, vars, missing), fill(b, vars, missing)] as const),
    bullets: s.bullets?.map((b) => fill(b, vars, missing)),
    note: s.note ? fill(s.note, vars, missing) : undefined,
  };
}

export function loadDeck(name: string): Deck {
  const path = join(VIDEO_DIR, 'scripts', `${name}.beats.json`);
  if (!existsSync(path)) throw new Error(`Unknown deck "${name}": ${path} not found`);
  const deck = readJson<Deck>(path);
  const vars = loadNumbers();
  const missing = new Set<string>();
  const beats = deck.beats.map((b) => ({
    ...b,
    vo: fill(b.vo, vars, missing),
    tts: b.tts ? fill(b.tts, vars, missing) : undefined,
    caption: fill(b.caption, vars, missing),
    still: b.still ? fillStill(b.still, vars, missing) : undefined,
  }));
  if (missing.size) throw new Error(`Deck ${name}: unresolved placeholders ${[...missing].join(', ')} (add them to scripts/numbers.json)`);
  return { ...deck, beats };
}

/** Parse a dotenv file without echoing values. */
export function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function deckArg(): string {
  const d = process.argv[2];
  if (!d || d.startsWith('--')) throw new Error('Usage: node <script>.ts <deck> [options]  (deck = pitch | demo | dryrun)');
  return d;
}

export interface VoManifest {
  readonly engine: string;
  readonly beats: Record<string, { readonly file: string; readonly durationSec: number }>;
}

export function loadVo(deck: string): VoManifest | null {
  const p = join(OUT_DIR, deck, 'vo.json');
  return existsSync(p) ? readJson<VoManifest>(p) : null;
}
