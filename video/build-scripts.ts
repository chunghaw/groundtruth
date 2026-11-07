/**
 * Renders scripts/<deck>-script.md from scripts/<deck>.beats.json (the single source of truth).
 * Timings use measured voiceover durations when out/<deck>/vo.json exists, else ~2.7 words/s.
 *
 *   node build-scripts.ts            (pitch + demo)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_DIR, loadDeck, loadVo } from './lib/common.ts';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const plain = (s: string) => s.replace(/\[\[(.+?)\]\]/g, '**$1**');

for (const name of ['pitch', 'demo']) {
  const deck = loadDeck(name);
  const vo = loadVo(name);
  const measured = Boolean(vo);
  let t = deck.titleSec;
  const lines = [
    `# ${deck.title}`,
    '',
    `Generated from \`scripts/${name}.beats.json\` by \`node build-scripts.ts\`. Edit the JSON, not this file.`,
    `Timings: ${measured ? `measured voiceover (${vo!.engine})` : 'estimated at 2.7 words/s (run voiceover.ts for real timings)'}. Budget ${deck.maxTotalSec} s.`,
    '',
    `**0:00.0 Title card** (${deck.titleSec} s): Groundtruth · Chrome extension · built on the Microburbs API`,
    '',
  ];
  for (const b of deck.beats) {
    const words = b.vo.split(/\s+/).length;
    const d = (vo?.beats[b.id]?.durationSec ?? words / 2.7) + deck.tailPadSec;
    lines.push(
      `## ${fmt(t)}–${fmt(t + d)} · ${b.id} (planned ${b.window}, VO budget ${b.maxSec} s)`,
      '',
      `- **Voiceover:** ${b.vo}`,
      `- **On screen:** ${b.action}${b.still ? ` _(slide: ${b.still.name})_` : ''}`,
      `- **Caption:** ${plain(b.caption)}`,
      '',
    );
    t += d;
  }
  lines.push(`**${fmt(t)} End card** (${deck.endSec} s): Groundtruth · Built on the Microburbs API · github.com/chunghaw/groundtruth`, '', `**Total ≈ ${fmt(t + deck.endSec)}** (limit ${fmt(deck.maxTotalSec)})`, '');
  const out = join(VIDEO_DIR, 'scripts', `${name}-script.md`);
  writeFileSync(out, lines.join('\n'));
  console.log(`${out}  ≈${(t + deck.endSec).toFixed(1)}s`);
}
