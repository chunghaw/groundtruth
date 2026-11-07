/**
 * Renders caption overlays (transparent 1920x1080 PNG per beat), title/end cards and still slides
 * with headless Chromium, so ffmpeg only needs `overlay` (no libass/freetype dependency).
 *
 *   node cards.ts <deck>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { OUT_DIR, deckArg, loadDeck, loadNumbers, type StillSpec } from './lib/common.ts';

const deck = loadDeck(deckArg());
const nums = loadNumbers();
const dir = join(OUT_DIR, deck.deck, 'cards');
mkdirSync(dir, { recursive: true });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const emph = (s: string) => esc(s.replace(/G-NAF/g, 'G\u2011NAF')).replace(/\[\[(.+?)\]\]/g, '<em>$1</em>');

const BASE_CSS = `
:root { --ink:#14181d; --ink-2:#232a33; --paper:#f5f1e6; --accent:#ffc400; --harbour:#2c79b5; --good:#3fb07a; --bad:#e0484f;
  --serif:"Iowan Old Style","Palatino",Georgia,serif; --sans:"Avenir Next","Helvetica Neue",Arial,sans-serif; --mono:"SF Mono",Menlo,monospace; }
* { box-sizing:border-box; margin:0; }
html,body { width:1920px; height:1080px; background:transparent; font-family:var(--sans); -webkit-font-smoothing:antialiased; }
em { font-style:normal; color:var(--accent); }
.slide { width:1920px; height:1080px; background:radial-gradient(1200px 700px at 78% 18%, #1f2a36 0%, var(--ink) 60%); color:var(--paper);
  padding:120px 150px; display:flex; flex-direction:column; justify-content:center; position:relative; overflow:hidden; }
.slide::after { content:""; position:absolute; inset:0; background-image:radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px); background-size:6px 6px; }
.kicker { font:600 26px/1 var(--mono); letter-spacing:.22em; text-transform:uppercase; color:var(--accent); }
.wordmark { font:600 168px/1 var(--serif); letter-spacing:-.03em; margin:28px 0 30px; }
.lede { font:500 50px/1.25 var(--sans); max-width:1350px; color:#e8e2d2; }
.meta { margin-top:70px; display:flex; gap:48px; font:500 30px/1.3 var(--mono); color:#b8b09d; }
.meta b { color:var(--paper); font-weight:600; }
h2 { font:600 92px/1.05 var(--serif); letter-spacing:-.02em; margin:24px 0 50px; max-width:1500px; }
table { border-collapse:collapse; width:1400px; font:500 40px/1.2 var(--sans); }
td { padding:20px 0; border-bottom:1px solid rgba(245,241,230,.16); }
td:last-child { text-align:right; font:600 46px/1 var(--mono); color:var(--accent); }
ul { list-style:none; padding:0; font:500 46px/1.3 var(--sans); max-width:1500px; }
li { padding:18px 0 18px 54px; position:relative; border-bottom:1px solid rgba(245,241,230,.12); }
li::before { content:""; position:absolute; left:0; top:38px; width:24px; height:4px; background:var(--accent); }
.note { margin-top:40px; font:500 28px/1.4 var(--mono); color:#9e977f; }
.cap { position:absolute; left:110px; right:110px; bottom:84px; display:flex; }
.cap div { background:rgba(20,24,29,.9); color:var(--paper); border-left:8px solid var(--accent); border-radius:6px 14px 14px 6px;
  padding:24px 38px 26px; font:600 52px/1.22 var(--sans); letter-spacing:-.005em; box-shadow:0 12px 40px rgba(0,0,0,.35); max-width:1500px; }
`;

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${body}</body></html>`;

function titleCard(): string {
  return page(`<section class="slide"><div class="kicker">Microburbs hackathon · Sydney</div>
  <div class="wordmark">Groundtruth</div>
  <p class="lede">A <em>Chrome extension</em> that shows the <em>buyer</em> what the listing doesn’t.</p>
  <div class="meta"><span>Built on the <b>Microburbs API</b></span><span>realestate.com.au · domain.com.au</span></div></section>`);
}

function endCard(): string {
  return page(`<section class="slide"><div class="kicker">Team Groundtruth</div>
  <div class="wordmark">Groundtruth</div>
  <p class="lede">Built on the <em>Microburbs API</em>, ready for any property extension.</p>
  <div class="meta"><span><b>${esc(nums.repoUrl ?? 'github.com/chunghaw/groundtruth')}</b></span><span>${esc(nums.demoUrl ?? '')}</span></div></section>`);
}

function still(s: StillSpec): string {
  const rows = s.rows ? `<table>${s.rows.map(([a, b]) => `<tr><td>${emph(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>` : '';
  const bullets = s.bullets ? `<ul>${s.bullets.map((b) => `<li>${emph(b)}</li>`).join('')}</ul>` : '';
  return page(`<section class="slide"><div class="kicker">Groundtruth</div><h2>${emph(s.heading)}</h2>${rows}${bullets}${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}</section>`);
}

const caption = (text: string) => page(`<div class="cap"><div>${emph(text)}</div></div>`);

const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const shoot = async (html: string, file: string, transparent: boolean) => {
    await p.setContent(html, { waitUntil: 'load' });
    await p.screenshot({ path: join(dir, file), omitBackground: transparent });
  };
  await shoot(titleCard(), 'title.png', false);
  await shoot(endCard(), 'end.png', false);
  for (const b of deck.beats) {
    await shoot(caption(b.caption), `caption-${b.id}.png`, true);
    if (b.still) await shoot(still(b.still), `still-${b.still.name}.png`, false);
  }
} finally {
  await browser.close();
}
console.log(`cards: ${dir}`);
