/**
 * MapLibre renderer for the "What can rise next door" card. Only bundled into the map entries
 * (extension iframe page map3d.js, web groundtruth-map3d.js), never into content.js.
 * Uses the CSP build: no blob workers, no eval; the caller supplies the worker URL.
 */
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp.js';
import MAPLIBRE_CSS from 'maplibre-gl/dist/maplibre-gl.css';
import type { Context3D, MapController, Overlay } from './types';

export { MAPLIBRE_CSS };

export const COLORS = {
  ground: '#efe9dc',
  lotLine: '#c9bfa8',
  subject: '#1d5a8a',
  ramp: [[9, '#efdcae'], [15, '#e3b062'], [25, '#cf7a3c'], [35, '#a8452b'], [45, '#6e1f2b']] as Array<[number, string]>,
  road: '#b4232c',
} as const;

const BASEMAP_URL = 'https://tiles.openfreemap.org/styles/positron';
const BASEMAP_TIMEOUT_MS = 2500;
const OSM_ATTRIBUTION = '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap';

export interface RenderOptions {
  readonly workerUrl: string;
  /** Try the OpenFreeMap positron basemap; falls back to a blank style on any failure. */
  readonly basemap?: boolean;
  readonly reducedMotion?: boolean;
  /** Where to inject MapLibre CSS (a ShadowRoot or document.head). Default: the container itself. */
  readonly cssRoot?: Node;
}

type Style = { version: 8; sources: Record<string, unknown>; layers: unknown[]; [k: string]: unknown };
const BLANK: Style = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': COLORS.ground } }] };

async function loadStyle(useBasemap: boolean): Promise<{ style: Style; tiles: boolean }> {
  if (!useBasemap) return { style: BLANK, tiles: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BASEMAP_TIMEOUT_MS);
  try {
    const res = await fetch(BASEMAP_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const style = (await res.json()) as Style;
    if (style?.version !== 8 || !Array.isArray(style.layers)) throw new Error('bad style');
    return { style, tiles: true };
  } catch {
    return { style: BLANK, tiles: false };
  } finally {
    clearTimeout(t);
  }
}

function boundsOf(data: Context3D): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as [number, number];
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  data.lots.features.forEach((f) => walk(f.geometry.coordinates));
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

const heightColor = ['interpolate', ['linear'], ['coalesce', ['get', 'maxHeightM'], 0], ...COLORS.ramp.flat()];
const height = ['coalesce', ['get', 'maxHeightM'], 0];

function addLayers(map: maplibregl.Map, data: Context3D): void {
  const empty = { type: 'FeatureCollection', features: [] };
  map.addSource('gt-lots', { type: 'geojson', data: data.lots as never });
  map.addSource('gt-noise', { type: 'geojson', data: (data.noise ?? empty) as never });
  map.addSource('gt-roads', { type: 'geojson', data: (data.busyRoads ?? empty) as never });
  const add = (l: unknown) => map.addLayer(l as maplibregl.LayerSpecification);
  add({ id: 'gt-lot-fill', type: 'fill', source: 'gt-lots', paint: { 'fill-color': '#f7f3ea', 'fill-opacity': 0.85 } });
  add({ id: 'gt-noise', type: 'fill', source: 'gt-noise', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['coalesce', ['get', 'opacity'], 0.5], 0.75] } });
  add({ id: 'gt-lot-line', type: 'line', source: 'gt-lots', paint: { 'line-color': COLORS.lotLine, 'line-width': 1 } });
  add({ id: 'gt-roads', type: 'line', source: 'gt-roads', layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': COLORS.road, 'line-width': ['match', ['get', 'roadClass'], ['motorway', 'trunk', 'primary'], 6, 4], 'line-opacity': 0.85 } });
  const extrude = (id: string, filter: unknown, color: unknown, opacity: number) =>
    add({ id, type: 'fill-extrusion', source: 'gt-lots', filter, paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': height, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': opacity, 'fill-extrusion-vertical-gradient': true } });
  extrude('gt-lots-hob', ['all', ['==', ['get', 'source'], 'hob'], ['!', ['get', 'isSubject']]], heightColor, 0.92);
  extrude('gt-lots-fsr', ['all', ['==', ['get', 'source'], 'fsr-estimate'], ['!', ['get', 'isSubject']]], heightColor, 0.5);
  extrude('gt-subject', ['get', 'isSubject'], COLORS.subject, 0.97);
}

/** Render the 3D block into `container`. Resolves once the style has loaded and our layers are on. */
export async function renderMap(container: HTMLElement, data: Context3D, opts: RenderOptions): Promise<MapController> {
  maplibregl.setWorkerUrl(opts.workerUrl);
  const cssHost = opts.cssRoot ?? container;
  if (!(cssHost as ParentNode).querySelector?.('style[data-maplibre]')) {
    const style = document.createElement('style');
    style.setAttribute('data-maplibre', '');
    style.textContent = MAPLIBRE_CSS;
    (cssHost instanceof Document ? cssHost.head : (cssHost as ParentNode)).append(style);
  }
  const { style, tiles } = await loadStyle(!!opts.basemap);
  const bounds = boundsOf(data);
  const map = new maplibregl.Map({
    container,
    style: style as never,
    center: (data.center ?? [151.2093, -33.8688]) as [number, number],
    zoom: 16.4,
    pitch: 55,
    bearing: -20,
    maxPitch: 70,
    scrollZoom: false,
    // MapLibre's compact control re-expands on resize and covers a 240 px map; we draw a one-line credit instead.
    attributionControl: false,
    fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Map timed out loading')), 15_000);
    map.once('load', () => { clearTimeout(timer); resolve(); });
  });
  addLayers(map, data);
  if (tiles) {
    const credit = document.createElement('div');
    credit.textContent = OSM_ATTRIBUTION;
    credit.setAttribute('style', 'position:absolute;right:4px;bottom:3px;z-index:2;font:10px/1.3 system-ui,sans-serif;color:#33415a;background:rgba(255,255,255,.75);padding:1px 5px;border-radius:3px;pointer-events:none');
    container.append(credit);
  }
  if (bounds) map.fitBounds(bounds, { padding: 16, pitch: 55, bearing: -20, duration: 0 });
  if (!opts.reducedMotion) map.once('idle', () => map.easeTo({ bearing: 0, duration: 9000, easing: (t) => t * (2 - t) }));
  return {
    setOverlay(layer: Overlay, on: boolean) {
      const id = layer === 'noise' ? 'gt-noise' : 'gt-roads';
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    },
    destroy() { map.remove(); },
  };
}
