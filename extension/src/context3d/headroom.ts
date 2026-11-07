/**
 * Pure geometry for the "headroom" insight: compare today's buildings (OpenStreetMap footprints with
 * render_height from the OpenMapTiles "building" layer) with each lot's permitted max height and
 * produce translucent "ghost" volumes for what could still rise. No MapLibre here, so it is testable.
 */
import type { Context3D, GeoCollection, HeadroomInsight, HeadroomLot, HeightSource, Pos } from './types';

export const STOREY_M = 3.2;
export const MIN_HEADROOM_STOREYS = 2;
export const NEAR_M = 100;
const M_PER_DEG_LAT = 111_320;

export interface Building { readonly ring: readonly Pos[]; readonly height: number; readonly base: number }
export interface GhostProps {
  readonly base: number;
  readonly top: number;
  readonly headroomStoreys: number;
  readonly maxHeightM: number;
  readonly source: HeightSource;
  /** false = no building height known, ghost drawn from the ground (fallback mode). */
  readonly measured: boolean;
}
export interface HeadroomResult {
  readonly ghosts: GeoCollection<GhostProps>;
  readonly insight: HeadroomInsight;
  readonly subjectBuilding: Building | null;
}

export function pointInRing(p: Pos, ring: readonly Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring: readonly Pos[]): Pos {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const n = pts.length || 1;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}

export function offsetM(from: Pos, to: Pos): { east: number; north: number; dist: number } {
  const east = (to[0] - from[0]) * M_PER_DEG_LAT * Math.cos((from[1] * Math.PI) / 180);
  const north = (to[1] - from[1]) * M_PER_DEG_LAT;
  return { east, north, dist: Math.hypot(east, north) };
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (east: number, north: number): string => DIRS[Math.round(((Math.atan2(east, north) * 180) / Math.PI + 360) / 45) % 8];
/** Map bearing (degrees clockwise from north) looking from `from` towards `to`. */
export const bearingTo = (from: Pos, to: Pos): number => {
  const o = offsetM(from, to);
  return (Math.atan2(o.east, o.north) * 180) / Math.PI;
};

/** Outer rings of a Polygon / MultiPolygon geometry. */
export function outerRings(geom: { readonly type: string; readonly coordinates: unknown }): Pos[][] {
  if (geom.type === 'Polygon') return [((geom.coordinates as Pos[][])[0] ?? [])].filter((r) => r.length > 2);
  if (geom.type === 'MultiPolygon') return (geom.coordinates as Pos[][][]).map((p) => p[0] ?? []).filter((r) => r.length > 2);
  return [];
}

interface LotIdx { rings: Pos[][]; bbox: [number, number, number, number]; c: Pos; maxHeightM: number | null; source: HeightSource; isSubject: boolean; actual: number | null; geometry: Context3D['lots']['features'][number]['geometry'] }

function indexLots(data: Context3D): LotIdx[] {
  return data.lots.features.map((f) => {
    const rings = outerRings(f.geometry);
    const xs = rings.flat().map((p) => p[0]);
    const ys = rings.flat().map((p) => p[1]);
    return {
      rings, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number],
      c: ringCentroid(rings[0] ?? [[0, 0]]), maxHeightM: f.properties.maxHeightM, source: f.properties.source,
      isSubject: f.properties.isSubject, actual: null, geometry: f.geometry,
    };
  }).filter((l) => l.rings.length > 0);
}

const lotAt = (lots: LotIdx[], p: Pos): LotIdx | undefined =>
  lots.find((l) => p[0] >= l.bbox[0] && p[0] <= l.bbox[2] && p[1] >= l.bbox[1] && p[1] <= l.bbox[3] && l.rings.some((r) => pointInRing(p, r)));

function findSubjectBuilding(buildings: readonly Building[], home: Pos | null, subjectLot: LotIdx | undefined): Building | null {
  if (home) {
    const hit = buildings.filter((b) => pointInRing(home, b.ring)).sort((a, b) => b.height - a.height)[0];
    if (hit) return hit;
  }
  if (!subjectLot) return null;
  return buildings.filter((b) => subjectLot.rings.some((r) => pointInRing(ringCentroid(b.ring), r))).sort((a, b) => b.height - a.height)[0] ?? null;
}

/**
 * Ghost = lot footprint from today's tallest building on it up to the permitted height, kept only when
 * that gap is >= MIN_HEADROOM_STOREYS. With no building heights at all (known=false) we fall back to
 * the full envelope of lots permitted >= 2 storeys more than the home's own lot, drawn from the ground.
 */
export function computeHeadroom(data: Context3D, buildings: readonly Building[]): HeadroomResult {
  const lots = indexLots(data);
  for (const b of buildings) {
    const lot = lotAt(lots, ringCentroid(b.ring));
    if (lot) lot.actual = Math.max(lot.actual ?? 0, b.height);
  }
  const home = data.center;
  const subjectLot = lots.find((l) => l.isSubject);
  const subjectBuilding = findSubjectBuilding(buildings, home, subjectLot);
  const known = lots.some((l) => l.actual !== null);
  const minGap = MIN_HEADROOM_STOREYS * STOREY_M;
  const subjectMax = data.subject?.maxHeightM ?? null;

  const features: Array<{ type: 'Feature'; geometry: LotIdx['geometry']; properties: GhostProps }> = [];
  const near: HeadroomLot[] = [];
  for (const l of lots) {
    if (l.isSubject || l.maxHeightM === null) continue;
    const base = known ? l.actual : 0;
    if (base === null) continue; // lot without a mapped building: don't guess
    if (!known && (subjectMax === null || l.maxHeightM - subjectMax < minGap)) continue;
    const gap = l.maxHeightM - base;
    if (gap < minGap) continue;
    const storeys = Math.round(gap / STOREY_M);
    features.push({ type: 'Feature', geometry: l.geometry, properties: { base: Math.round(base * 10) / 10, top: l.maxHeightM, headroomStoreys: storeys, maxHeightM: l.maxHeightM, source: l.source, measured: known } });
    if (!known || !home) continue;
    const o = offsetM(home, l.c);
    if (o.dist <= NEAR_M) near.push({ distanceM: Math.round(o.dist), direction: compass(o.east, o.north), storeys, maxHeightM: l.maxHeightM, actualM: Math.round(base * 10) / 10, source: l.source });
  }
  near.sort((a, b) => b.storeys - a.storeys || a.distanceM - b.distanceM);
  const insight: HeadroomInsight = {
    known, nearM: NEAR_M, count: near.length,
    minStoreys: near.length ? Math.min(...near.map((n) => n.storeys)) : 0,
    maxStoreys: near.length ? near[0].storeys : 0,
    biggest: near[0] ?? null,
    subjectActualM: subjectBuilding ? Math.round(subjectBuilding.height * 10) / 10 : null,
  };
  return { ghosts: { type: 'FeatureCollection', features }, insight, subjectBuilding };
}

/** Building footprints from MapLibre vector-tile features (OpenMapTiles "building" layer). */
export function buildingsFrom(features: ReadonlyArray<{ geometry: { type: string; coordinates?: unknown }; properties: Record<string, unknown> | null }>): Building[] {
  const out: Building[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const h = Number(p.render_height);
    if (!Number.isFinite(h) || h <= 0 || p.hide_3d === true) continue;
    const base = Number(p.render_min_height) || 0;
    for (const ring of outerRings(f.geometry as { type: string; coordinates: unknown })) out.push({ ring, height: h, base });
  }
  return out;
}
