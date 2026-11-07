/**
 * Voiceover per beat. ElevenLabs when ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID are set
 * (proxy/.env.local or the environment), otherwise macOS `say` as a placeholder voice.
 * Cached by text hash in .cache/vo. Writes out/<deck>/vo.json with measured durations.
 *
 *   node voiceover.ts <deck> [--say] [--force]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, OUT_DIR, REPO_DIR, deckArg, flag, loadDeck, loadEnvFile } from './lib/common.ts';

const deck = loadDeck(deckArg());
const fileEnv = loadEnvFile(join(REPO_DIR, 'proxy', '.env.local'));
const env = (k: string): string | undefined => process.env[k] || fileEnv[k] || undefined;
const apiKey = env('ELEVENLABS_API_KEY');
const GEORGE_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // ElevenLabs premade voice "George"
const voiceId = env('ELEVENLABS_VOICE_ID') ?? (apiKey ? GEORGE_VOICE_ID : undefined);
const modelId = env('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
const engine: 'elevenlabs' | 'say' = !flag('say') && apiKey && voiceId ? 'elevenlabs' : 'say';
const sayVoice = pickSayVoice();

const voDir = join(CACHE_DIR, 'vo');
mkdirSync(voDir, { recursive: true });
mkdirSync(join(OUT_DIR, deck.deck), { recursive: true });

function pickSayVoice(): string | null {
  try {
    const list = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
    for (const v of ['Karen', 'Lee', 'Samantha']) if (new RegExp(`^${v}\\s`, 'm').test(list)) return v;
  } catch { /* say unavailable */ }
  return null;
}

function durationOf(file: string): number {
  try {
    const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const m = out.match(/estimated duration:\s*([\d.]+)/);
    if (m) return Number(m[1]);
  } catch { /* fall through to ffprobe */ }
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(out.trim());
}

async function elevenlabs(text: string, file: string): Promise<void> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId!)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function say(text: string, file: string): void {
  const args = [...(sayVoice ? ['-v', sayVoice] : []), '-r', '182', '-o', file, text];
  execFileSync('say', args);
}

const result: Record<string, { file: string; durationSec: number; text: string }> = {};
let total = 0;
for (const beat of deck.beats) {
  const text = beat.tts ?? beat.vo;
  const key = createHash('sha256').update([engine, voiceId ?? sayVoice ?? '', modelId, text].join('|')).digest('hex').slice(0, 16);
  const file = join(voDir, `${key}.${engine === 'elevenlabs' ? 'mp3' : 'aiff'}`);
  if (!existsSync(file) || flag('force')) {
    process.stdout.write(`  synth ${beat.id} (${engine})… `);
    if (engine === 'elevenlabs') await elevenlabs(text, file);
    else say(text, file);
    process.stdout.write('ok\n');
  }
  const durationSec = Math.round(durationOf(file) * 1000) / 1000;
  total += durationSec + deck.tailPadSec;
  const over = durationSec > beat.maxSec ? `  OVER budget (${beat.maxSec}s)` : '';
  console.log(`${beat.id.padEnd(16)} ${durationSec.toFixed(2)}s${over}`);
  result[beat.id] = { file, durationSec, text };
}

total += deck.titleSec + deck.endSec;
writeFileSync(join(OUT_DIR, deck.deck, 'vo.json'), JSON.stringify({ engine, voice: engine === 'say' ? sayVoice : 'elevenlabs', beats: result }, null, 2));
console.log(`engine=${engine}${engine === 'say' ? ' (placeholder voice: set ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in proxy/.env.local)' : ''}`);
console.log(`estimated runtime ${total.toFixed(1)}s / max ${deck.maxTotalSec}s${total > deck.maxTotalSec ? '  ** TOO LONG: trim voiceover text **' : ''}`);
if (total > deck.maxTotalSec) process.exitCode = 3;
