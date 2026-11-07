/**
 * Screen capture per beat with Playwright Chromium (headed, persistent profile, unpacked extension).
 *
 *   node capture.ts <deck> [--target live|demo] [--only <beatId>] [--headless]
 *
 * Shot list: shots/<deck>.<target>.json. Each beat: `setup` (off camera) then `show` (on camera).
 * After `show`, the clip is held until the beat's voiceover length (out/<deck>/vo.json; run voiceover.ts first).
 * Output: out/<deck>/clips/<beat>/frames.ffconcat + out/<deck>/manifest.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { runAction, type Action } from './lib/actions.ts';
import { CACHE_DIR, EXTENSION_DIST, OUT_DIR, VIDEO_DIR, arg, deckArg, fill, flag, loadDeck, loadVo, readJson } from './lib/common.ts';
import { CURSOR_INIT_SCRIPT } from './lib/cursor.ts';
import { PanelDriver } from './lib/panel.ts';
import { BeatRecorder } from './lib/recorder.ts';

interface ShotBeat { readonly setup?: Action[]; readonly show?: Action[]; readonly crop?: string; readonly newPage?: boolean }
interface ShotList {
  readonly init?: Action[];             // off-camera actions run once per session (makes --only work)
  readonly vars?: Record<string, string>;
  readonly viewport: { width: number; height: number };
  readonly deviceScaleFactor: number;
  readonly extension: boolean;
  readonly blockers?: string[];
  readonly beats: Record<string, ShotBeat>;
}

const SETTLE_SEC = 0.8;
const deckName = deckArg();
const target = arg('target') ?? 'live';
const only = arg('only');
const deck = loadDeck(deckName);
const shotsPath = arg('shots') ?? join(VIDEO_DIR, 'shots', `${deckName}.${target}.json`);
if (!existsSync(shotsPath)) throw new Error(`shot list not found: ${shotsPath}`);
const vars = readJson<ShotList>(shotsPath).vars ?? {};
const missing = new Set<string>();
const shots = JSON.parse(fill(readFileSync(shotsPath, 'utf8'), vars, missing)) as ShotList;
const unresolved = [...missing].filter((k) => !(k in vars));
if (unresolved.length) throw new Error(`${shotsPath}: unresolved {{${unresolved.join('}}, {{')}}}`);
const placeholders = Object.entries(vars).filter(([, v]) => /REPLACE_ME/.test(v)).map(([k]) => k);

const vo = loadVo(deckName);
if (!vo) console.warn(`! no out/${deckName}/vo.json: run "node voiceover.ts ${deckName}" first. Holding 5 s per beat.`);
const outDeck = join(OUT_DIR, deckName);
mkdirSync(outDeck, { recursive: true });
const manifestPath = join(outDeck, 'manifest.json');
const manifest: Record<string, unknown> = existsSync(manifestPath) ? readJson(manifestPath) : {};
const frameSize = { width: Math.round(shots.viewport.width * shots.deviceScaleFactor), height: Math.round(shots.viewport.height * shots.deviceScaleFactor) };

async function launch(): Promise<BrowserContext> {
  const args = ['--hide-scrollbars', '--disable-features=Translate', '--no-first-run'];
  if (shots.extension) {
    if (!existsSync(join(EXTENSION_DIST, 'manifest.json'))) throw new Error('extension/dist missing: build it first (cd extension && npm run build)');
    args.push(`--disable-extensions-except=${EXTENSION_DIST}`, `--load-extension=${EXTENSION_DIST}`);
  }
  const headless = flag('headless');
  return chromium.launchPersistentContext(join(CACHE_DIR, `profile-${target}`), {
    headless,
    ...(headless ? { channel: 'chromium' } : {}),
    viewport: shots.viewport,
    deviceScaleFactor: shots.deviceScaleFactor,
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    args,
  });
}

async function captureBeat(page: Page, beatId: string, shot: ShotBeat, holdSec: number): Promise<Record<string, unknown>> {
  const warnings: string[] = [];
  const dir = join(outDeck, 'clips', beatId);
  const panel = await PanelDriver.attach(page);
  const rec = await BeatRecorder.start(page, dir, frameSize);
  const ctx = { page, panel, blockers: shots.blockers ?? [], sinceMark: () => rec.sinceMark(), warn: (m: string) => { warnings.push(m); console.warn(`  ! ${m}`); } };
  for (const a of shot.setup ?? []) await runAction(ctx, a);
  rec.mark();
  for (const a of shot.show ?? []) await runAction(ctx, a);
  const shown = rec.sinceMark();
  if (shown > holdSec) ctx.warn(`on-camera actions took ${shown.toFixed(1)}s > voiceover ${holdSec.toFixed(1)}s; beat extends with silence (max +3 s)`);
  // Always let the final state paint and settle on camera.
  await new Promise((r) => setTimeout(r, Math.max(holdSec - shown, SETTLE_SEC) * 1000));
  const res = await rec.stop();
  console.log(`  ${beatId}: ${res.seconds.toFixed(1)}s, ${res.frames} frames`);
  return { kind: 'clip', concat: res.concat, seconds: res.seconds, crop: shot.crop ?? null, warnings, target };
}

async function main(): Promise<void> {
  const todo = deck.beats.filter((b) => !b.still && (!only || b.id === only));
  const unfilled = todo.filter((b) => JSON.stringify(shots.beats[b.id] ?? {}).includes('REPLACE_ME')).map((b) => b.id);
  if (unfilled.length) {
    throw new Error(`${shotsPath}: beats ${unfilled.join(', ')} still use REPLACE_ME vars (${placeholders.join(', ')}). Put real listing URLs in "vars", or use --target demo`);
  }
  const context = await launch();
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  let page = context.pages()[0] ?? (await context.newPage());
  try {
    if (shots.init?.length) {
      const panel = await PanelDriver.attach(page);
      const ictx = { page, panel, blockers: shots.blockers ?? [], sinceMark: () => 0, warn: (m: string) => console.warn(`  ! init: ${m}`) };
      for (const a of shots.init) await runAction(ictx, a);
    }
    for (const beat of deck.beats) {
      if (beat.still) { manifest[beat.id] = { kind: 'still', still: beat.still.name }; continue; }
      if (only && beat.id !== only) continue;
      const shot = shots.beats[beat.id];
      if (!shot) throw new Error(`no shot for beat ${beat.id} in ${shotsPath}`);
      if (shot.newPage) { await page.close(); page = await context.newPage(); }
      const hold = (vo?.beats[beat.id]?.durationSec ?? 5) + deck.tailPadSec;
      console.log(`> ${beat.id} (hold ${hold.toFixed(1)}s)`);
      manifest[beat.id] = await captureBeat(page, beat.id, shot, hold);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } finally {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    await context.close();
  }
  console.log(`manifest: ${manifestPath}`);
}

main().catch((e: unknown) => { console.error(`capture failed: ${(e as Error).message}`); process.exit(1); });
