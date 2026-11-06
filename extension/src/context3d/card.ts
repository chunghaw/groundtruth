/**
 * "What can rise next door" card. Pure DOM; the map itself comes from a Context3DHost so this file
 * never pulls MapLibre into content.js. Data and map load only when the card scrolls into view.
 */
import { h } from '../content/dom';
import type { Context3D, Context3DHost, Highlight, MapController, Overlay } from './types';

export const RAMP_CSS = 'linear-gradient(90deg,#efdcae,#e3b062 25%,#cf7a3c 50%,#a8452b 75%,#6e1f2b)';

const storeys = (n: number | null | undefined) => (n ? ` (≈${n} storey${n === 1 ? '' : 's'})` : '');
const metres = (m: number) => `${Number.isInteger(m) ? m : m.toFixed(1)} m`;

export function neighbourCaption(t: Highlight | null): string | null {
  if (!t) return null;
  const est = t.source === 'fsr-estimate' ? ', estimated from FSR' : '';
  return `Lot ${t.distanceM} m ${t.direction}: up to ${metres(t.maxHeightM)}${storeys(t.storeys)}${est}`;
}

export function subjectCaption(d: Context3D): string | null {
  const s = d.subject;
  if (!s || s.maxHeightM === null) return null;
  return `Your lot: up to ${metres(s.maxHeightM)}${storeys(s.storeys)}${s.source === 'fsr-estimate' ? ', estimated from FSR' : ''}`;
}

interface CardState { data: Context3D | null; error: string | null; map: MapController | null; mapError: string | null; overlays: Record<Overlay, boolean> }

export function context3dCard(gnafId: string, host: Context3DHost): HTMLElement {
  const st: CardState = { data: null, error: null, map: null, mapError: null, overlays: { noise: false, roads: false } };
  const caption = h('div', { class: 'c3-cap', 'aria-live': 'polite' }, h('div', { class: 'shimmer' }));
  const stage = h('div', { class: 'c3-stage', 'aria-label': '3D view of permitted building heights' });
  const tools = h('div', { class: 'c3-tools', role: 'group', 'aria-label': 'Map overlays' });
  const legend = h('div', { class: 'c3-legend' });
  const foot = h('div', { class: 'c3-foot' });
  const card = h('section', { class: 'card c3', 'aria-label': 'What can rise next door' },
    h('h3', {}, 'What can rise next door'),
    h('div', { class: 'sub' }, 'What can legally go up next door: each lot within 200 m raised to its maximum permitted building height.'),
    caption, stage, tools, legend, foot);

  const toggle = (layer: Overlay, label: string) => {
    const btn = h('button', { class: 'c3-chip', type: 'button', 'aria-pressed': 'false', onClick: () => {
      st.overlays = { ...st.overlays, [layer]: !st.overlays[layer] };
      btn.setAttribute('aria-pressed', String(st.overlays[layer]));
      st.map?.setOverlay(layer, st.overlays[layer]);
    } }, h('span', { class: `c3-sw ${layer}` }), label);
    return btn;
  };

  const showData = (d: Context3D) => {
    if (!d.available) {
      card.classList.add('na');
      caption.replaceChildren(h('div', { class: 'big' }, d.reason ?? 'No lot data around this home.'));
      stage.remove(); tools.remove(); legend.remove();
      return;
    }
    const lead = neighbourCaption(d.tallestNeighbour);
    const mine = subjectCaption(d);
    caption.replaceChildren(
      h('div', { class: 'c3-lead' }, lead ?? (d.heightSource === 'none' ? 'No height controls are mapped for these lots.' : 'No taller neighbour within 120 m.')),
      ...(mine ? [h('div', { class: 'c3-mine' }, h('span', { class: 'c3-dot' }), mine)] : []));
    tools.replaceChildren(...[d.noise ? toggle('noise', 'Noise') : null, d.busyRoads ? toggle('roads', 'Busy roads') : null].filter((x): x is HTMLButtonElement => !!x));
    const heights = d.lots.features.map((f) => f.properties.maxHeightM).filter((x): x is number => typeof x === 'number');
    legend.replaceChildren(
      h('span', { class: 'c3-ramp', style: `background:${RAMP_CSS}` }),
      h('span', {}, heights.length ? `${metres(Math.min(...heights))} – ${metres(Math.max(...heights))}` : '—'),
      h('span', { class: 'c3-dot' }), h('span', {}, 'this home'),
      ...(d.heightSource === 'mixed' || d.heightSource === 'fsr-estimate' ? [h('span', { class: 'c3-est' }, 'faded = estimated from FSR')] : []));
    foot.textContent = ['Height of Building / FSR controls (LEP), Microburbs. Planning limits, not approved DAs.', ...d.notes].join(' ');
  };

  const startMap = (d: Context3D) => {
    if (st.map || !d.available) return;
    stage.classList.add('loading');
    host.mount(stage, d).then((m) => {
      st.map = m;
      stage.classList.remove('loading');
      (Object.keys(st.overlays) as Overlay[]).forEach((k) => st.overlays[k] && m.setOverlay(k, true));
    }).catch((e: Error) => {
      st.mapError = e.message;
      stage.classList.remove('loading');
      stage.replaceChildren(h('div', { class: 'c3-fallback' }, '3D view unavailable here. ', e.message));
    });
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    host.load(gnafId).then((d) => { st.data = d; showData(d); startMap(d); }).catch((e: Error) => {
      st.error = e.message;
      card.classList.add('na');
      caption.replaceChildren(h('div', { class: 'big' }, `Neighbourhood heights unavailable: ${e.message}`));
      stage.remove(); tools.remove(); legend.remove();
    });
  };

  // Lazy: wait until the card is (nearly) on screen. No IntersectionObserver (tests, old hosts) -> load now.
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '150px' });
    queueMicrotask(() => io.observe(card));
  } else queueMicrotask(start);
  return card;
}

export const CONTEXT3D_CSS = /* css */ `
.c3 .c3-cap { display: grid; gap: 4px; margin: 6px 0 10px; min-height: 36px; }
.c3 .c3-lead { font: 600 15px/1.3 var(--sans); letter-spacing: -.01em; color: var(--ink); }
.c3 .c3-mine { font: 12px/1.4 var(--sans); color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.c3 .c3-dot { width: 10px; height: 10px; border-radius: 2px; background: #1d5a8a; box-shadow: 0 0 0 2px #e7f0f8; flex: none; display: inline-block; }
.c3 .c3-stage { position: relative; height: 240px; margin: 0 -14px; background: #efe9dc; border-block: 1px solid var(--line); overflow: hidden; }
.c3 .c3-stage.loading::after { content: "Raising the block…"; position: absolute; inset: 0; display: grid; place-items: center; font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); background: linear-gradient(110deg, #efe9dc 30%, #f7f3ea 50%, #efe9dc 70%) 0 0 / 300% 100%; animation: c3-sheen 1.4s linear infinite; }
@keyframes c3-sheen { to { background-position: -150% 0; } }
@media (prefers-reduced-motion: reduce) { .c3 .c3-stage.loading::after { animation: none; } }
.c3 .c3-fallback { padding: 16px; font-size: 12px; color: var(--ink-3); }
.c3 .c3-tools { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.c3 .c3-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #fffef9; border-radius: 999px; padding: 4px 10px; cursor: pointer; font: 600 11px/1.2 var(--sans); color: var(--ink-2); transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.c3 .c3-chip:hover { border-color: var(--harbour-2); }
.c3 .c3-chip[aria-pressed="true"] { background: var(--ink); color: #f5f1e6; border-color: var(--ink); }
.c3 .c3-sw { width: 10px; height: 10px; border-radius: 50%; }
.c3 .c3-sw.noise { background: radial-gradient(circle, #990000, #f3a712); }
.c3 .c3-sw.roads { background: #b4232c; border-radius: 2px; height: 4px; }
.c3 .c3-legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; font: 11px/1.3 var(--mono); color: var(--ink-3); }
.c3 .c3-ramp { width: 64px; height: 8px; border-radius: 2px; }
.c3 .c3-est { flex-basis: 100%; }
.c3 .c3-foot { margin-top: 8px; font-size: 10.5px; line-height: 1.4; color: var(--ink-3); }
`;
