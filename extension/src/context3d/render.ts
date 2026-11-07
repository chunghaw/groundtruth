/**
 * MapLibre renderer for the "What can rise next door" card. Only bundled into the map entries
 * (extension iframe page map3d.js, web groundtruth-map3d.js), never into content.js.
 * Uses the CSP build: no blob workers, no eval; the caller supplies the worker URL.
 *
 * Look: an architectural model. Real buildings (OpenFreeMap / OpenMapTiles "building" layer,
 * render_height) in warm stone, the home in harbour blue with a pulse ring, and translucent amber
 * "ghost" volumes on lots that could legally rise >= 2 storeys above what stands there today.
 *
 * Premium path (not implemented): Google Photorealistic 3D Tiles via deck.gl Tile3DLayer when a
 * browser-restricted GOOGLE_MAPS_TILES_KEY is defined at build time. See README-lane.md.
 */
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp.js';
import MAPLIBRE_CSS from 'maplibre-gl/dist/maplibre-gl.css';
import { bearingTo, buildingsFrom, computeHeadroom, ringCentroid, type Building } from './headroom';
import type { Context3D, HeadroomInsight, MapController, Overlay, Pos } from './types';

export { MAPLIBRE_CSS };

export const COLORS = {
  ground: '#e9e4d8',
  street: '#f8f5ee',
  park: '#d6dcc6',
  water: '#c9d6dc',
  wallLow: '#fdfbf6',
  wallHigh: '#f3eee4',
  subject: '#1d5a8a',
  subjectTop: '#2c79b5',
  ghost: [[2, '#ffb938'], [5, '#ff8a3d'], [10, '#f04e5e']] as Array<[number, string]>,
  ghostCap: '#fff1d6',
  road: '#b4232c',
} as const;

const BASEMAP_URL = 'https://tiles.openfreemap.org/styles/positron';
const BASEMAP_TIMEOUT_MS = 3000;
const OSM_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
const GHOST_OPACITY = 0.68;
const VIEW = { zoom: 16.25, pitch: 58 } as const;
/** Basemap layers kept (muted); everything else (POIs, place labels, shields, flat buildings) goes. */
const KEEP = /^(background|park|water|landuse_residential|landcover_wood|highway_(minor|major_casing|major_inner|major_subtle|motorway_.*)|railway.*|highway-name-(major|minor))$/;

export interface RenderOptions {
  readonly workerUrl: string;
  /** Try the OpenFreeMap basemap (needed for real buildings); falls back to a blank style on any failure. */
  readonly basemap?: boolean;
  readonly reducedMotion?: boolean;
  /** Where to inject MapLibre CSS (a ShadowRoot or document.head). Default: the container itself. */
  readonly cssRoot?: Node;
}

type Layer = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown>; [k: string]: unknown };
type Style = { version: 8; sources: Record<string, unknown>; layers: Layer[]; [k: string]: unknown };
const BLANK: Style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': COLORS.ground } }] };

/** Positron, stripped to a quiet model base, plus our real-building extrusion layer. */
export function modelStyle(base: Style): Style {
  const tint: Record<string, Record<string, unknown>> = {
    background: { 'background-color': COLORS.ground },
    park: { 'fill-color': COLORS.park, 'fill-opacity': 0.8 },
    landcover_wood: { 'fill-color': COLORS.park, 'fill-opacity': 0.6 },
    water: { 'fill-color': COLORS.water },
    landuse_residential: { 'fill-color': COLORS.ground, 'fill-opacity': 0 },
  };
  const layers = base.layers.filter((l) => KEEP.test(l.id)).map((l) => {
    const paint = { ...(l.paint ?? {}), ...(tint[l.id] ?? {}) };
    if (l.type === 'line' && /highway_(minor|major_inner|major_subtle)/.test(l.id)) paint['line-color'] = COLORS.street;
    if (l.type === 'line' && /casing/.test(l.id)) paint['line-color'] = '#ddd5c4';
    if (l.id === 'highway-name-major' || l.id === 'highway-name-minor') paint['text-color'] = '#7a7465';
    return { ...l, paint } as Layer;
  });
  layers.push({
    id: 'gt-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, COLORS.wallLow, 40, COLORS.wallHigh],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': true,
    },
  });
  return {
    ...base, layers,
    light: { anchor: 'map', color: '#fffaf0', intensity: 0.22, position: [1.15, 300, 30] }, // Sydney afternoon sun, from the north-west
    sky: { 'sky-color': '#dfe6ec', 'horizon-color': '#f2ede4', 'fog-color': '#ece6da', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.9, 'fog-ground-blend': 0.7, 'atmosphere-blend': 0 },
  };
}

async function loadStyle(useBasemap: boolean): Promise<{ style: Style; tiles: boolean }> {
  if (!useBasemap) return { style: BLANK, tiles: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BASEMAP_TIMEOUT_MS);
  try {
    const res = await fetch(BASEMAP_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const style = (await res.json()) as Style;
    if (style?.version !== 8 || !Array.isArray(style.layers)) throw new Error('bad style');
    return { style: modelStyle(style), tiles: true };
  } catch {
    return { style: BLANK, tiles: false };
  } finally {
    clearTimeout(t);
  }
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const;
const ghostColor = ['interpolate', ['linear'], ['get', 'headroomStoreys'], ...COLORS.ghost.flat()];
/** Ghost height at rise progress t (0 = flat on today's roof, 1 = permitted max). */
const ghostTop = (t: number) => ['+', ['get', 'base'], ['*', t, ['-', ['get', 'top'], ['get', 'base']]]];

function addLayers(map: maplibregl.Map, data: Context3D): void {
  const add = (l: unknown) => map.addLayer(l as maplibregl.LayerSpecification);
  const below = map.getLayer('gt-buildings') ? 'gt-buildings' : undefined;
  map.addSource('gt-noise', { type: 'geojson', data: (data.noise ?? EMPTY) as never });
  map.addSource('gt-roads', { type: 'geojson', data: (data.busyRoads ?? EMPTY) as never });
  map.addSource('gt-ghosts', { type: 'geojson', data: EMPTY as never });
  map.addSource('gt-subject', { type: 'geojson', data: EMPTY as never });
  map.addSource('gt-home', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: data.center ?? [0, 0] }, properties: {} } as never });
  const addBelow = (l: unknown) => map.addLayer(l as maplibregl.LayerSpecification, below);
  addBelow({ id: 'gt-noise', type: 'fill', source: 'gt-noise', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['*', ['coalesce', ['get', 'opacity'], 0.5], 0.6] } });
  addBelow({ id: 'gt-roads', type: 'line', source: 'gt-roads', layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': COLORS.road, 'line-width': ['match', ['get', 'roadClass'], ['motorway', 'trunk', 'primary'], 7, 5], 'line-opacity': 0.75, 'line-blur': 1 } });
  addBelow({ id: 'gt-ghost-foot', type: 'line', source: 'gt-ghosts', paint: { 'line-color': ghostColor, 'line-width': 2.2, 'line-opacity': 0.85, 'line-dasharray': [2, 1.5] } });
  addBelow({ id: 'gt-pulse', type: 'circle', source: 'gt-home', paint: { 'circle-radius': 10, 'circle-color': COLORS.subjectTop, 'circle-opacity': 0, 'circle-stroke-width': 2, 'circle-stroke-color': COLORS.subjectTop, 'circle-stroke-opacity': 0.6, 'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map' } });
  add({ id: 'gt-subject', type: 'fill-extrusion', source: 'gt-subject', paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height'], 0, COLORS.subject, 30, COLORS.subjectTop], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } });
  add({ id: 'gt-ghosts', type: 'fill-extrusion', source: 'gt-ghosts', paint: { 'fill-extrusion-color': ghostColor, 'fill-extrusion-base': ['+', ['get', 'base'], 0.15], 'fill-extrusion-height': ghostTop(0), 'fill-extrusion-opacity': GHOST_OPACITY, 'fill-extrusion-vertical-gradient': false } });
  // Bright rim on top of each ghost: a thin slab at the permitted height (MapLibre lines can't float).
  add({ id: 'gt-ghost-cap', type: 'fill-extrusion', source: 'gt-ghosts', paint: { 'fill-extrusion-color': COLORS.ghostCap, 'fill-extrusion-base': ['max', ['get', 'base'], ['-', ghostTop(0), 0.5]], 'fill-extrusion-height': ghostTop(0), 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': false } });
}

function setGhostRise(map: maplibregl.Map, t: number): void {
  map.setPaintProperty('gt-ghosts', 'fill-extrusion-height', ghostTop(t));
  map.setPaintProperty('gt-ghost-cap', 'fill-extrusion-height', ghostTop(t));
  map.setPaintProperty('gt-ghost-cap', 'fill-extrusion-base', ['max', ['get', 'base'], ['-', ghostTop(t), 0.5]]);
}

/** Slightly inflate a footprint so the blue home doesn't z-fight with the stone building under it. */
const inflate = (ring: readonly Pos[], k = 1.03): Pos[] => {
  const c = ringCentroid(ring);
  return ring.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
};

function subjectFeature(data: Context3D, b: Building | null): unknown {
  if (b) return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [inflate(b.ring)] }, properties: { height: b.height + 0.3, base: b.base } };
  const lot = data.lots.features.find((f) => f.properties.isSubject);
  // No matched OSM building: show the home's lot as a modest two-storey block.
  return lot ? { type: 'Feature', geometry: lot.geometry, properties: { height: 7, base: 0 } } : EMPTY;
}

function readBuildings(map: maplibregl.Map): Building[] {
  if (!map.getSource('openmaptiles')) return [];
  try {
    return buildingsFrom(map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }) as never);
  } catch {
    return [];
  }
}

function homePin(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('style', 'display:flex;flex-direction:column;align-items:center;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(14,23,38,.25))');
  const pill = document.createElement('div');
  pill.textContent = 'Your home';
  pill.setAttribute('style', `font:600 11px/1 system-ui,-apple-system,sans-serif;letter-spacing:.02em;color:#fff;background:${COLORS.subject};padding:6px 9px;border-radius:999px;border:1.5px solid #fff;white-space:nowrap`);
  const stem = document.createElement('div');
  stem.setAttribute('style', `width:1.5px;height:34px;background:linear-gradient(${COLORS.subject},rgba(29,90,138,0))`);
  el.append(pill, stem);
  return el;
}

const waitIdle = (map: maplibregl.Map, ms: number) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  map.once('idle', () => { clearTimeout(t); resolve(); });
});

/** Render the 3D model into `container`. Resolves once buildings are read and the insight is known. */
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
  const center = (data.center ?? [151.2093, -33.8688]) as [number, number];
  const map = new maplibregl.Map({
    container,
    style: style as never,
    center,
    zoom: 15.2,
    pitch: 35,
    bearing: -60,
    maxPitch: 75,
    scrollZoom: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { antialias: true },
  });
  let alive = true;
  let raf = 0;
  // A map initialised while its frame/stage was hidden or 0x0 keeps a 0x0 canvas: resize once visible.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (alive && container.clientWidth > 0 && container.clientHeight > 0) map.resize(); }) : null;
  ro?.observe(container);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Map timed out loading')), 15_000);
    map.once('load', () => { clearTimeout(timer); resolve(); });
  });
  map.resize();
  addLayers(map, data);
  if (tiles) {
    const credit = document.createElement('div');
    credit.textContent = OSM_ATTRIBUTION;
    credit.setAttribute('style', 'position:absolute;right:4px;bottom:3px;z-index:2;font:10px/1.3 system-ui,sans-serif;color:#33415a;background:rgba(255,255,255,.75);padding:1px 5px;border-radius:3px;pointer-events:none');
    container.append(credit);
  }

  // Read today's buildings from the loaded z14 tiles, then compute the headroom ghosts.
  await waitIdle(map, 6000);
  const { ghosts, insight, subjectBuilding } = computeHeadroom(data, readBuildings(map));
  (map.getSource('gt-ghosts') as maplibregl.GeoJSONSource).setData(ghosts as never);
  (map.getSource('gt-subject') as maplibregl.GeoJSONSource).setData(subjectFeature(data, subjectBuilding) as never);
  const pinHeight = subjectBuilding?.height ?? 7;
  const marker = new maplibregl.Marker({ element: homePin(), anchor: 'bottom', offset: [0, -Math.min(60, 8 + pinHeight * 1.4)] }).setLngLat(center).addTo(map);

  // Face the camera so the biggest "could rise" lot sits behind the home.
  const target = biggestGhostCentre(ghosts);
  const bearing = target ? bearingTo(center, target) : -20;
  // Aim a little past the home towards that lot so both the home and its tallest ghost are in frame.
  const aim: [number, number] = target ? [center[0] + (target[0] - center[0]) * 0.3, center[1] + (target[1] - center[1]) * 0.3] : center;
  const home = { center: aim, zoom: VIEW.zoom, pitch: VIEW.pitch, bearing };

  const pulse = (t0: number) => (now: number) => {
    if (!alive) return;
    const p = ((now - t0) % 2200) / 2200;
    map.setPaintProperty('gt-pulse', 'circle-radius', 8 + p * 30);
    map.setPaintProperty('gt-pulse', 'circle-stroke-opacity', 0.7 * (1 - p));
    raf = requestAnimationFrame(pulse(t0));
  };
  const rise = (t0: number, dur: number) => (now: number) => {
    if (!alive) return;
    const p = Math.min(1, Math.max(0, (now - t0) / dur));
    setGhostRise(map, 1 - (1 - p) ** 3);
    if (p < 1) requestAnimationFrame(rise(t0, dur));
  };

  if (opts.reducedMotion) {
    map.jumpTo(home);
    setGhostRise(map, 1);
    map.setPaintProperty('gt-pulse', 'circle-radius', 16);
  } else {
    map.flyTo({ ...home, duration: 3200, curve: 1.2, essential: false });
    const start = performance.now();
    requestAnimationFrame(rise(start + 900, 1800));
    raf = requestAnimationFrame(pulse(start));
    map.once('moveend', () => {
      if (alive) map.easeTo({ bearing: bearing + 25, duration: 9000, easing: (t) => t * (2 - t) });
    });
  }

  return {
    insight,
    setOverlay(layer: Overlay, on: boolean) {
      const ids = layer === 'noise' ? ['gt-noise'] : layer === 'roads' ? ['gt-roads'] : ['gt-ghosts', 'gt-ghost-cap', 'gt-ghost-foot'];
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    },
    resetView() {
      map.stop();
      if (opts.reducedMotion) map.jumpTo(home);
      else map.flyTo({ ...home, duration: 1400 });
    },
    destroy() { alive = false; ro?.disconnect(); cancelAnimationFrame(raf); marker.remove(); map.remove(); },
  };
}

function biggestGhostCentre(ghosts: ReturnType<typeof computeHeadroom>['ghosts']): Pos | null {
  const g = [...ghosts.features].sort((a, b) => b.properties.headroomStoreys - a.properties.headroomStoreys)[0];
  if (!g) return null;
  const c = g.geometry.coordinates as Pos[][] | Pos[][][];
  const ring = (typeof c[0][0][0] === 'number' ? c[0] : (c as Pos[][][])[0][0]) as Pos[];
  return ringCentroid(ring);
}

export type { HeadroomInsight };
