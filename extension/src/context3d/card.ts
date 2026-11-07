/**
 * "What can rise next door" card. Pure DOM; the map itself comes from a Context3DHost so this file
 * never pulls MapLibre into content.js. Data and map load only when the card scrolls into view.
 *
 * Caption flow: permitted-height captions first (from the proxy), upgraded to the headroom insight
 * ("2 lots within 100 m could rise ~6 more storeys") once the map has compared real buildings.
 */
import { h } from '../content/dom';
import type { Context3D, Context3DHost, HeadroomInsight, Highlight, MapController, Overlay } from './types';

export const GHOST_RAMP_CSS = 'linear-gradient(90deg,#f7b84b,#f58a4b 40%,#e8505b)';

const storeys = (n: number | null | undefined) => (n ? ` (≈${n} storey${n === 1 ? '' : 's'})` : '');
const metres = (m: number) => `${Number.isInteger(m) ? m : m.toFixed(1)} m`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function neighbourCaption(t: Highlight | null): string | null {
  if (!t) return null;
  const est = t.source === 'fsr-estimate' ? ', estimated from FSR' : '';
  return `Lot ${t.distanceM} m ${t.direction}: up to ${metres(t.maxHeightM)}${storeys(t.storeys)}${est}`;
}

export function subjectCaption(d: Context3D, actualM: number | null = null): string | null {
  const s = d.subject;
  if (!s || s.maxHeightM === null) return null;
  const now = actualM !== null ? ` · about ${metres(actualM)} today` : '';
  return `Your lot: up to ${metres(s.maxHeightM)}${storeys(s.storeys)}${s.source === 'fsr-estimate' ? ', estimated from FSR' : ''}${now}`;
}

/** Headline + detail from the map's headroom insight; null when building heights were unknown. */
export function headroomCaption(i: HeadroomInsight | null | undefined): { lead: string; detail: string | null } | null {
  if (!i || !i.known) return null;
  if (i.count === 0 || !i.biggest) return { lead: `Nothing within ${i.nearM} m can legally rise 2+ storeys above what's there now.`, detail: null };
  const range = i.count > 1 && i.minStoreys !== i.maxStoreys ? `${i.minStoreys}–${i.maxStoreys}` : `~${i.maxStoreys}`;
  const b = i.biggest;
  const est = b.source === 'fsr-estimate' ? ', FSR estimate' : '';
  return {
    lead: `${plural(i.count, 'lot')} within ${i.nearM} m could rise ${range} more storeys`,
    detail: `Biggest: ${b.distanceM} m ${b.direction}, +${b.storeys} storeys (≈${metres(b.actualM)} today → ${metres(b.maxHeightM)} allowed${est})`,
  };
}

interface CardState { data: Context3D | null; error: string | null; map: MapController | null; mapError: string | null; overlays: Record<Overlay, boolean> }

export function context3dCard(gnafId: string, host: Context3DHost): HTMLElement {
  const st: CardState = { data: null, error: null, map: null, mapError: null, overlays: { noise: false, roads: false, headroom: true } };
  const caption = h('div', { class: 'c3-cap', 'aria-live': 'polite' }, h('div', { class: 'shimmer' }));
  const stage = h('div', { class: 'c3-stage', 'aria-label': '3D model of your home and what could legally rise on nearby lots' });
  const tools = h('div', { class: 'c3-tools' });
  const legend = h('div', { class: 'c3-legend' });
  const foot = h('div', { class: 'c3-foot' });
  const card = h('section', { class: 'card c3', 'aria-label': 'What can rise next door' },
    h('h3', {}, 'What can rise next door'),
    h('div', { class: 'sub' }, "Today's buildings, with glass volumes where planning rules allow 2+ more storeys."),
    caption, stage, tools, legend, foot);

  const toggle = (layer: Overlay, label: string) => {
    const btn = h('button', { class: 'c3-seg', type: 'button', 'aria-pressed': String(st.overlays[layer]), onClick: () => {
      st.overlays = { ...st.overlays, [layer]: !st.overlays[layer] };
      btn.setAttribute('aria-pressed', String(st.overlays[layer]));
      st.map?.setOverlay(layer, st.overlays[layer]);
    } }, h('span', { class: `c3-sw ${layer}` }), label);
    return btn;
  };

  const renderCaption = (d: Context3D, insight: HeadroomInsight | null) => {
    const hr = headroomCaption(insight);
    const lead = hr?.lead ?? neighbourCaption(d.tallestNeighbour) ?? (d.heightSource === 'none' ? 'No height controls are mapped for these lots.' : 'No taller neighbour within 120 m.');
    const mine = subjectCaption(d, insight?.subjectActualM ?? null);
    caption.replaceChildren(
      h('div', { class: 'c3-lead' }, lead),
      ...(hr?.detail ? [h('div', { class: 'c3-detail' }, hr.detail)] : []),
      ...(mine ? [h('div', { class: 'c3-mine' }, h('span', { class: 'c3-dot' }), mine)] : []));
  };

  const showData = (d: Context3D) => {
    if (!d.available) {
      card.classList.add('na');
      caption.replaceChildren(h('div', { class: 'big' }, d.reason ?? 'No lot data around this home.'));
      stage.remove(); tools.remove(); legend.remove();
      return;
    }
    renderCaption(d, null);
    const seg = h('div', { class: 'c3-segs', role: 'group', 'aria-label': 'Map layers' },
      toggle('headroom', 'Headroom'),
      ...[d.noise ? toggle('noise', 'Noise') : null, d.busyRoads ? toggle('roads', 'Busy roads') : null].filter((x): x is HTMLButtonElement => !!x));
    const reset = h('button', { class: 'c3-reset', type: 'button', title: 'Reset the camera', onClick: () => st.map?.resetView?.() }, 'Reset view');
    tools.replaceChildren(seg);
    stage.append(reset);
    legend.replaceChildren(
      h('span', { class: 'c3-ramp', style: `background:${GHOST_RAMP_CSS}` }), h('span', {}, '+2 → +10 storeys of room'),
      h('span', { class: 'c3-dot' }), h('span', {}, 'your home'),
      ...(d.heightSource === 'mixed' || d.heightSource === 'fsr-estimate' ? [h('span', { class: 'c3-est' }, 'Some limits estimated from FSR')] : []));
    foot.textContent = ['Permitted heights: LEP Height of Building / FSR controls via Microburbs. Planning limits, not approved DAs. Today’s heights: OpenStreetMap.', ...d.notes].join(' ');
  };

  const onMapReady = (d: Context3D, m: MapController) => {
    if (m.insight && !m.insight.known) foot.textContent = `${foot.textContent ?? ''} Current building heights unavailable here, so glass shows the full permitted envelope.`;
    else renderCaption(d, m.insight ?? null);
  };

  const startMap = (d: Context3D) => {
    if (st.map || !d.available) return;
    stage.classList.add('loading');
    host.mount(stage, d).then((m) => {
      st.map = m;
      stage.classList.remove('loading');
      (Object.keys(st.overlays) as Overlay[]).forEach((k) => (k === 'headroom' ? !st.overlays[k] && m.setOverlay(k, false) : st.overlays[k] && m.setOverlay(k, true)));
      onMapReady(d, m);
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
.c3 .c3-lead { font: 650 16px/1.25 var(--sans); letter-spacing: -.015em; color: var(--ink); text-wrap: balance; }
.c3 .c3-detail { font: 12px/1.4 var(--sans); color: var(--ink-2); }
.c3 .c3-mine { font: 12px/1.4 var(--sans); color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.c3 .c3-dot { width: 10px; height: 10px; border-radius: 3px; background: #1d5a8a; box-shadow: 0 0 0 2px rgba(44,121,181,.25); flex: none; display: inline-block; }
.c3 .c3-stage { position: relative; height: 280px; margin: 0 -14px; background: #e9e4d8; border-block: 1px solid var(--line); overflow: hidden; }
.c3 .c3-stage::before { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none; box-shadow: inset 0 18px 24px -18px rgba(14,23,38,.18), inset 0 -18px 24px -18px rgba(14,23,38,.12); }
.c3 .c3-stage.loading::after { content: "Building the model…"; position: absolute; inset: 0; display: grid; place-items: center; font: 600 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); background: linear-gradient(110deg, #e9e4d8 30%, #f4f0e7 50%, #e9e4d8 70%) 0 0 / 300% 100%; animation: c3-sheen 1.4s linear infinite; }
@keyframes c3-sheen { to { background-position: -150% 0; } }
@media (prefers-reduced-motion: reduce) { .c3 .c3-stage.loading::after { animation: none; } }
.c3 .c3-fallback { padding: 16px; font-size: 12px; color: var(--ink-3); }
.c3 .c3-tools { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }
.c3 .c3-segs { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: rgba(14,23,38,.06); border: 1px solid var(--line); }
.c3 .c3-seg { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; border-radius: 999px; padding: 5px 10px; white-space: nowrap; cursor: pointer; font: 600 11px/1.2 var(--sans); color: var(--ink-2); transition: background var(--dur) var(--ease), color var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
.c3 .c3-seg:hover { color: var(--ink); background: rgba(255,255,255,.55); }
.c3 .c3-seg[aria-pressed="true"] { background: #fffef9; color: #0e1726; box-shadow: 0 1px 2px rgba(14,23,38,.12), 0 0 0 1px rgba(14,23,38,.06); }
.c3 .c3-seg:active { transform: translateY(1px); }
.c3 .c3-reset { position: absolute; top: 8px; right: 8px; z-index: 3; white-space: nowrap; border: 1px solid rgba(14,23,38,.1); background: rgba(255,254,249,.88); backdrop-filter: blur(6px); border-radius: 999px; padding: 5px 10px; font: 600 11px/1.2 var(--sans); color: #1d5a8a; cursor: pointer; box-shadow: 0 1px 3px rgba(14,23,38,.12); transition: background var(--dur) var(--ease), transform var(--dur) var(--ease); }
.c3 .c3-reset:hover { background: #fff; color: #2c79b5; }
.c3 .c3-reset:active { transform: translateY(1px); }
.c3 .c3-sw { width: 10px; height: 10px; border-radius: 50%; opacity: .45; transition: opacity var(--dur) var(--ease); }
.c3 .c3-seg[aria-pressed="true"] .c3-sw { opacity: 1; }
.c3 .c3-sw.noise { background: radial-gradient(circle, #990000, #f3a712); }
.c3 .c3-sw.roads { background: #b4232c; border-radius: 2px; height: 4px; }
.c3 .c3-sw.headroom { background: ${GHOST_RAMP_CSS}; border-radius: 2px; box-shadow: inset 0 2px 0 #fff1d6; }
.c3 .c3-legend { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; font: 11px/1.3 var(--mono); color: var(--ink-3); }
.c3 .c3-ramp { width: 56px; height: 8px; border-radius: 2px; opacity: .8; }
.c3 .c3-legend .c3-dot { margin-left: 8px; }
.c3 .c3-est { flex-basis: 100%; }
.c3 .c3-foot { margin-top: 8px; font-size: 10.5px; line-height: 1.4; color: var(--ink-3); }
`;
