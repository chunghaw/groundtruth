/**
 * Tiny planar geometry helpers for the 3D context card (no turf dependency).
 * Coordinates are GeoJSON [lng, lat]. Distances use a local equirectangular projection,
 * which is accurate to well under 1% at the ~200 m scale we work at.
 */
export type Pos = [number, number];
export type Ring = Pos[];
export type PolygonCoords = Ring[];
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

const M_PER_DEG_LAT = 111_320;
export const mPerDegLng = (lat: number): number => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
export const roundPos = (p: Pos): Pos => [round6(p[0]), round6(p[1])];

const isPos = (v: unknown): v is Pos => Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number" && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const isRing = (v: unknown): v is Ring => Array.isArray(v) && v.length >= 3 && v.every(isPos);

/** Polygon or MultiPolygon geometry -> list of polygons (outer ring first). Anything else -> []. */
export function polygonsOf(geom: unknown): PolygonCoords[] {
  if (!geom || typeof geom !== "object") return [];
  const g = geom as { type?: unknown; coordinates?: unknown };
  const asPoly = (c: unknown): PolygonCoords | null => (Array.isArray(c) && c.length > 0 && c.every(isRing) ? (c as Ring[]).map((r) => r.map((p) => [p[0], p[1]] as Pos)) : null);
  if (g.type === "Polygon") {
    const p = asPoly(g.coordinates);
    return p ? [p] : [];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) return g.coordinates.map(asPoly).filter((p): p is PolygonCoords => p !== null);
  return [];
}

/** LineString or MultiLineString -> list of lines. */
export function linesOf(geom: unknown): Pos[][] {
  if (!geom || typeof geom !== "object") return [];
  const g = geom as { type?: unknown; coordinates?: unknown };
  const asLine = (c: unknown): Pos[] | null => (Array.isArray(c) && c.length >= 2 && c.every(isPos) ? (c as Pos[]).map((p) => [p[0], p[1]] as Pos) : null);
  if (g.type === "LineString") {
    const l = asLine(g.coordinates);
    return l ? [l] : [];
  }
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) return g.coordinates.map(asLine).filter((l): l is Pos[] => l !== null);
  return [];
}

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/** Area-weighted centroid of the largest outer ring; vertex mean if degenerate. */
export function centroid(polys: PolygonCoords[]): Pos | null {
  if (polys.length === 0) return null;
  const largest = polys.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  // Work relative to the first vertex: shoelace on raw lng/lat loses precision badly.
  const [ox, oy] = largest[0];
  const outer: Ring = largest.map(([x, y]) => [x - ox, y - oy]);
  const a = ringArea(outer);
  if (Math.abs(a) < 1e-14) {
    const n = outer.length;
    return [ox + outer.reduce((s, p) => s + p[0], 0) / n, oy + outer.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const f = outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1];
    cx += (outer[j][0] + outer[i][0]) * f;
    cy += (outer[j][1] + outer[i][1]) * f;
  }
  return [ox + cx / (6 * a), oy + cy / (6 * a)];
}

function inRing(p: Pos, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in any polygon (holes respected). */
export function pointInPolygons(p: Pos, polys: PolygonCoords[]): boolean {
  return polys.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

export function bboxOf(polysOrLines: Pos[][]): BBox {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const ring of polysOrLines) for (const [x, y] of ring) {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

export const bboxIntersects = (a: BBox, b: BBox): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Square window of +-radiusM around a point. */
export function windowAround(c: Pos, radiusM: number): BBox {
  const dx = radiusM / mPerDegLng(c[1]);
  const dy = radiusM / M_PER_DEG_LAT;
  return { minX: c[0] - dx, minY: c[1] - dy, maxX: c[0] + dx, maxY: c[1] + dy };
}

/** Metres east/north of `from` to `to`. */
export function offsetM(from: Pos, to: Pos): { east: number; north: number; dist: number } {
  const east = (to[0] - from[0]) * mPerDegLng(from[1]);
  const north = (to[1] - from[1]) * M_PER_DEG_LAT;
  return { east, north, dist: Math.hypot(east, north) };
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function compass(east: number, north: number): string {
  const deg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/** Sutherland-Hodgman clip of a ring to an axis-aligned box. Returns a closed ring or null if empty. */
export function clipRing(ring: Ring, b: BBox): Ring | null {
  const edges: Array<[(p: Pos) => boolean, (a: Pos, c: Pos) => Pos]> = [
    [(p) => p[0] >= b.minX, (a, c) => [b.minX, a[1] + ((c[1] - a[1]) * (b.minX - a[0])) / (c[0] - a[0])]],
    [(p) => p[0] <= b.maxX, (a, c) => [b.maxX, a[1] + ((c[1] - a[1]) * (b.maxX - a[0])) / (c[0] - a[0])]],
    [(p) => p[1] >= b.minY, (a, c) => [a[0] + ((c[0] - a[0]) * (b.minY - a[1])) / (c[1] - a[1]), b.minY]],
    [(p) => p[1] <= b.maxY, (a, c) => [a[0] + ((c[0] - a[0]) * (b.maxY - a[1])) / (c[1] - a[1]), b.maxY]],
  ];
  let pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
  for (const [inside, cut] of edges) {
    if (pts.length === 0) break;
    const out: Pos[] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    pts = out;
  }
  if (pts.length < 3) return null;
  return [...pts, pts[0]];
}

/** Liang-Barsky clip of a polyline to a box; may split into several pieces. */
export function clipLine(line: Pos[], b: BBox): Pos[][] {
  const pieces: Pos[][] = [];
  let cur: Pos[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const seg = clipSegment(line[i], line[i + 1], b);
    if (!seg) {
      if (cur.length >= 2) pieces.push(cur);
      cur = [];
      continue;
    }
    const [s, e] = seg;
    const last = cur[cur.length - 1];
    if (!last || last[0] !== s[0] || last[1] !== s[1]) {
      if (cur.length >= 2) pieces.push(cur);
      cur = [s];
    }
    cur.push(e);
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces;
}

function clipSegment(a: Pos, c: Pos, b: BBox): [Pos, Pos] | null {
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const checks: Array<[number, number]> = [[-dx, a[0] - b.minX], [dx, b.maxX - a[0]], [-dy, a[1] - b.minY], [dy, b.maxY - a[1]]];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  const at = (t: number): Pos => (t === 0 ? a : t === 1 ? c : [a[0] + t * dx, a[1] + t * dy]);
  return [at(t0), at(t1)];
}
