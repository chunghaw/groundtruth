/**
 * Extension page map3d.html, iframed into the panel. Running the map here (extension origin) avoids
 * the listing site's CSP and the cross-origin Worker restriction a content script would hit.
 * Protocol (window.postMessage, parent <-> frame):
 *   frame -> parent  { type: 'gt3d:ready' }
 *   parent -> frame  { type: 'gt3d:data', data: Context3D, reducedMotion: boolean }
 *   parent -> frame  { type: 'gt3d:overlay', layer: 'noise' | 'roads', on: boolean }
 *   frame -> parent  { type: 'gt3d:rendered' } | { type: 'gt3d:error', message }
 */
import { renderMap } from './render';
import { isContext3D, type MapController } from './types';

let ctl: MapController | null = null;
const pending: Array<{ layer: 'noise' | 'roads'; on: boolean }> = [];
const reply = (msg: unknown) => window.parent.postMessage(msg, '*');

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window.parent) return;
  const m = e.data as { type?: string; data?: unknown; reducedMotion?: boolean; layer?: 'noise' | 'roads'; on?: boolean };
  if (m?.type === 'gt3d:data' && isContext3D(m.data) && !ctl) {
    const el = document.getElementById('map')!;
    renderMap(el, m.data, { workerUrl: chrome.runtime.getURL('maplibre-gl-csp-worker.js'), basemap: true, reducedMotion: !!m.reducedMotion, cssRoot: document })
      .then((c) => { ctl = c; pending.splice(0).forEach((p) => c.setOverlay(p.layer, p.on)); reply({ type: 'gt3d:rendered' }); })
      .catch((err: Error) => reply({ type: 'gt3d:error', message: err.message }));
  } else if (m?.type === 'gt3d:overlay' && (m.layer === 'noise' || m.layer === 'roads')) {
    if (ctl) ctl.setOverlay(m.layer, !!m.on);
    else pending.push({ layer: m.layer, on: !!m.on });
  }
});
reply({ type: 'gt3d:ready' });
