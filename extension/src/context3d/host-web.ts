/** Web demo host: same-origin fetch, map module + worker loaded lazily from next to groundtruth-panel.js. */
import { fetchContext3D } from './api';
import type { Context3D, Context3DHost, MapController } from './types';

type MapModule = { renderMap: (el: HTMLElement, d: Context3D, o: { workerUrl: string; basemap?: boolean; reducedMotion?: boolean; cssRoot?: Node }) => Promise<MapController> };

export function webContext3DHost(assetBase: string): Context3DHost {
  let mod: Promise<MapModule> | null = null;
  return {
    load: (gnafId, location) => fetchContext3D(gnafId, fetch, location ?? null),
    async mount(stage, data) {
      mod ??= import(/* webpackIgnore: true */ new URL('groundtruth-map3d.js', assetBase).href) as Promise<MapModule>;
      const m = await mod;
      let reduced = false;
      try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
      // CSS goes next to the map (inside the panel's shadow root), not into the page.
      return m.renderMap(stage, data, { workerUrl: new URL('maplibre-gl-csp-worker.js', assetBase).href, basemap: true, reducedMotion: reduced });
    },
  };
}
