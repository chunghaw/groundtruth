/**
 * "What can rise next door": neighbouring lots extruded to their legally permitted max height.
 *
 * Upstream (Microburbs, server-side only):
 *   /v1/properties/{gnaf}/surroundings/parcels          -> lot polygons within 200 m (+ is_subject)
 *   /v1/properties/{gnaf}/profile                        -> suburb (SAL) name
 *   /v1/suburbs/{suburb}/development/building-controls   -> HOB (height_m) + FSR (fsr) polygons
 *   /v1/suburbs/{suburb}/shapes/noise-heatmap            -> noise colour regions (optional layer)
 *   /v1/suburbs/{suburb}/shapes/busy-roads               -> busy road lines (optional layer)
 *
 * ALL response-shape knowledge lives in the `parse*` functions below so it can be fixed in one place
 * once real responses are seen. Shapes follow the OpenAPI spec examples; unverified against live data.
 */
import { bboxIntersects, bboxOf, centroid, clipLine, clipRing, compass, linesOf, offsetM, pointInPolygons, polygonsOf, roundPos, windowAround, type BBox, type PolygonCoords, type Pos } from "./geo";
import type { Upstream } from "./microburbs";

export type Fetcher = (pathAndQuery: string) => Promise<Upstream>;

export const RADIUS_M = 200;
/** Typical floor-to-floor height used to turn metres into storeys. */
export const STOREY_M = 3.2;
/**
 * FSR fallback heuristic (only when a lot has no height-of-building control):
 *   storeys ~= FSR / SITE_COVERAGE  (the floor area spread over a building covering half the lot)
 *   height  ~= storeys x STOREY_M   e.g. FSR 3:1 -> 6 storeys -> 19.2 m. Capped at FSR_HEIGHT_CAP_M.
 * Always labelled "estimated from FSR" in the UI.
 */
export const SITE_COVERAGE = 0.5;
export const FSR_HEIGHT_CAP_M = 80;

export type HeightSource = "hob" | "fsr-estimate" | "none";

export interface LotProps {
  gnafId: string | null;
  isSubject: boolean;
  maxHeightM: number | null;
  source: HeightSource;
  fsr: number | null;
  storeys: number | null;
}
interface Feature<G, P> { type: "Feature"; geometry: G; properties: P }
interface FC<G, P> { type: "FeatureCollection"; features: Array<Feature<G, P>> }
type PolyGeom = { type: "Polygon"; coordinates: Pos[][] } | { type: "MultiPolygon"; coordinates: Pos[][][] };
type LineGeom = { type: "LineString"; coordinates: Pos[] } | { type: "MultiLineString"; coordinates: Pos[][] };

export interface Highlight { gnafId: string | null; maxHeightM: number; storeys: number; source: HeightSource; distanceM: number; direction: string }

export interface Context3D {
  gnafId: string;
  available: boolean;
  reason?: string;
  center: Pos | null;
  radiusM: number;
  lots: FC<PolyGeom, LotProps>;
  noise: FC<PolyGeom, { color: string; opacity: number }> | null;
  busyRoads: FC<LineGeom, { roadClass: string }> | null;
  subject: { maxHeightM: number | null; storeys: number | null; source: HeightSource } | null;
  tallestNeighbour: Highlight | null;
  heightSource: "hob" | "fsr-estimate" | "mixed" | "none";
  notes: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const dataOf = (u: Upstream): unknown => (u.status === 200 && isObj(u.body) ? u.body.data ?? null : null);
const featuresOf = (fc: unknown): Obj[] => {
  if (Array.isArray(fc)) return fc.filter(isObj);
  if (isObj(fc) && Array.isArray(fc.features)) return fc.features.filter(isObj);
  return [];
};
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
};
const firstNum = (o: Obj, keys: readonly string[]): number | null => {
  for (const k of keys) {
    const n = num(o[k]);
    if (n !== null) return n;
  }
  return null;
};

// ---------- parsing (the only place that knows upstream shapes) ----------

export interface ParsedParcel { gnafId: string | null; isSubject: boolean; polys: PolygonCoords[] }
export function parseParcels(data: unknown): ParsedParcel[] {
  const d = isObj(data) ? data : {};
  const fc = d.parcels ?? d.geojson ?? d.features ?? data;
  return featuresOf(fc)
    .map((f) => {
      const p = isObj(f.properties) ? f.properties : {};
      const id = p.gnaf_pid ?? p.gnaf_id ?? p.gnafId ?? null;
      return { gnafId: typeof id === "string" ? id : null, isSubject: p.is_subject === true || p.isSubject === true, polys: polygonsOf(f.geometry) };
    })
    .filter((p) => p.polys.length > 0);
}

export interface Zone { value: number; polys: PolygonCoords[]; bbox: BBox }
const zonesFrom = (fc: unknown, keys: readonly string[]): Zone[] =>
  featuresOf(fc)
    .map((f) => {
      const polys = polygonsOf(f.geometry);
      const value = isObj(f.properties) ? firstNum(f.properties, keys) : null;
      return { value: value ?? NaN, polys, bbox: bboxOf(polys.map((p) => p[0])) };
    })
    .filter((z) => Number.isFinite(z.value) && z.value > 0 && z.polys.length > 0);

export function parseBuildingControls(data: unknown): { hob: Zone[]; fsr: Zone[] } {
  const d = isObj(data) ? data : {};
  const hob = isObj(d.hob) ? d.hob.geojson : null;
  const fsr = isObj(d.fsr) ? d.fsr.geojson : null;
  // FSR band strings look like "2.5:1"; num() takes the first number.
  return { hob: zonesFrom(hob, ["height_m", "max_height_m", "height", "value"]), fsr: zonesFrom(fsr, ["fsr", "max_fsr", "value"]) };
}

export function parseNoise(data: unknown): Array<{ polys: PolygonCoords[]; color: string; opacity: number }> {
  const d = isObj(data) ? data : {};
  return featuresOf(d.geojson ?? data).map((f) => {
    const p = isObj(f.properties) ? f.properties : {};
    return { polys: polygonsOf(f.geometry), color: typeof p.color === "string" ? p.color : "#cc3300", opacity: num(p.fill_opacity) ?? 0.5 };
  }).filter((n) => n.polys.length > 0);
}

export function parseBusyRoads(data: unknown): Array<{ lines: Pos[][]; roadClass: string }> {
  const d = isObj(data) ? data : {};
  return featuresOf(d.geojson ?? data).map((f) => {
    const p = isObj(f.properties) ? f.properties : {};
    return { lines: linesOf(f.geometry), roadClass: typeof p.road_class === "string" ? p.road_class : "road" };
  }).filter((r) => r.lines.length > 0);
}

export function parseSuburb(data: unknown): string | null {
  return isObj(data) && typeof data.suburb === "string" && data.suburb ? data.suburb : null;
}

// ---------- assembly ----------

export const storeysFor = (h: number): number => Math.max(1, Math.round(h / STOREY_M));
export const heightFromFsr = (fsr: number): number => Math.min(FSR_HEIGHT_CAP_M, Math.round((fsr / SITE_COVERAGE) * STOREY_M * 10) / 10);

function zoneValueAt(p: Pos, zones: Zone[]): number | null {
  let best: number | null = null;
  for (const z of zones) {
    if (p[0] < z.bbox.minX || p[0] > z.bbox.maxX || p[1] < z.bbox.minY || p[1] > z.bbox.maxY) continue;
    if (pointInPolygons(p, z.polys) && (best === null || z.value > best)) best = z.value;
  }
  return best;
}

const polyGeom = (polys: PolygonCoords[]): PolyGeom =>
  polys.length === 1 ? { type: "Polygon", coordinates: polys[0].map((r) => r.map(roundPos)) } : { type: "MultiPolygon", coordinates: polys.map((p) => p.map((r) => r.map(roundPos))) };

export function lotHeight(c: Pos, hob: Zone[], fsr: Zone[]): Pick<LotProps, "maxHeightM" | "source" | "fsr" | "storeys"> {
  const h = zoneValueAt(c, hob);
  const f = zoneValueAt(c, fsr);
  if (h !== null) return { maxHeightM: h, source: "hob", fsr: f, storeys: storeysFor(h) };
  if (f !== null) {
    const est = heightFromFsr(f);
    return { maxHeightM: est, source: "fsr-estimate", fsr: f, storeys: storeysFor(est) };
  }
  return { maxHeightM: null, source: "none", fsr: null, storeys: null };
}

export interface Inputs { gnafId: string; parcels: unknown; controls: unknown; noise: unknown; busyRoads: unknown }

export function buildContext3D(inp: Inputs): Context3D {
  const empty = (reason: string): Context3D => ({ gnafId: inp.gnafId, available: false, reason, center: null, radiusM: RADIUS_M, lots: { type: "FeatureCollection", features: [] }, noise: null, busyRoads: null, subject: null, tallestNeighbour: null, heightSource: "none", notes: [] });
  const parcels = parseParcels(inp.parcels);
  if (parcels.length === 0) return empty("No lot boundaries around this home.");
  const subjectParcel = parcels.find((p) => p.isSubject) ?? parcels.find((p) => p.gnafId === inp.gnafId) ?? null;
  const center = centroid(subjectParcel?.polys ?? parcels.flatMap((p) => p.polys)) as Pos;
  const win = windowAround(center, RADIUS_M);
  const { hob, fsr } = parseBuildingControls(inp.controls);
  const near = (zs: Zone[]) => zs.filter((z) => bboxIntersects(z.bbox, win));
  const hobNear = near(hob);
  const fsrNear = near(fsr);
  const notes: string[] = [];
  if (hobNear.length === 0 && fsrNear.length === 0) notes.push("No height or FSR controls mapped here.");

  const features: Array<Feature<PolyGeom, LotProps>> = [];
  let tallest: Highlight | null = null;
  let subject: Context3D["subject"] = null;
  for (const p of parcels) {
    const c = centroid(p.polys);
    if (!c) continue;
    const off = offsetM(center, c);
    if (off.dist > RADIUS_M * 1.05) continue;
    const isSubject = p === subjectParcel;
    const ht = lotHeight(c, hobNear, fsrNear);
    features.push({ type: "Feature", geometry: polyGeom(p.polys), properties: { gnafId: p.gnafId, isSubject, ...ht } });
    if (isSubject) subject = { maxHeightM: ht.maxHeightM, storeys: ht.storeys, source: ht.source };
    else if (ht.maxHeightM !== null && off.dist <= 120 && (!tallest || ht.maxHeightM > tallest.maxHeightM || (ht.maxHeightM === tallest.maxHeightM && off.dist < tallest.distanceM)))
      tallest = { gnafId: p.gnafId, maxHeightM: ht.maxHeightM, storeys: ht.storeys!, source: ht.source, distanceM: Math.round(off.dist), direction: compass(off.east, off.north) };
  }
  if (!subjectParcel) notes.push("The home's own lot was not flagged; centred on the surrounding lots.");
  const sources = new Set(features.map((f) => f.properties.source).filter((s) => s !== "none"));
  const heightSource = sources.size === 0 ? "none" : sources.size > 1 ? "mixed" : ([...sources][0] as "hob" | "fsr-estimate");
  if (sources.has("fsr-estimate")) notes.push(`Some heights estimated from FSR (FSR ÷ ${SITE_COVERAGE} site cover × ${STOREY_M} m per storey).`);

  const noiseFeatures = parseNoise(inp.noise).flatMap((n) => {
    const polys = n.polys.map((poly) => clipRing(poly[0], win)).filter((r): r is Pos[] => r !== null).map((r) => [r]);
    return polys.length ? [{ type: "Feature" as const, geometry: polyGeom(polys), properties: { color: n.color, opacity: n.opacity } }] : [];
  });
  const roadFeatures = parseBusyRoads(inp.busyRoads).flatMap((r) => {
    const lines = r.lines.flatMap((l) => clipLine(l, win)).map((l) => l.map(roundPos));
    if (lines.length === 0) return [];
    const geometry: LineGeom = lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
    return [{ type: "Feature" as const, geometry, properties: { roadClass: r.roadClass } }];
  });

  return {
    gnafId: inp.gnafId,
    available: features.length > 0,
    ...(features.length ? {} : { reason: "No lots within 200 m." }),
    center: roundPos(center),
    radiusM: RADIUS_M,
    lots: { type: "FeatureCollection", features },
    noise: noiseFeatures.length ? { type: "FeatureCollection", features: noiseFeatures } : null,
    busyRoads: roadFeatures.length ? { type: "FeatureCollection", features: roadFeatures } : null,
    subject,
    tallestNeighbour: tallest,
    heightSource,
    notes,
  };
}

// ---------- fetch + cache ----------

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = ((globalThis as { __gtCtx3d?: Map<string, { at: number; value: Context3D }> }).__gtCtx3d ??= new Map());

async function safe(f: Fetcher, path: string): Promise<Upstream> {
  try {
    return await f(path);
  } catch (e) {
    console.error("[groundtruth] context3d fetch failed", path, e instanceof Error ? e.message : e);
    return { status: 599, body: {} };
  }
}

export async function getContext3D(gnafId: string, fetcher: Fetcher): Promise<Context3D> {
  const hit = cache.get(gnafId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const base = `/v1/properties/${encodeURIComponent(gnafId)}`;
  const [parcelsRes, profileRes] = await Promise.all([safe(fetcher, `${base}/surroundings/parcels`), safe(fetcher, `${base}/profile`)]);
  const suburb = parseSuburb(dataOf(profileRes));
  const sub = suburb ? `/v1/suburbs/${encodeURIComponent(suburb)}` : null;
  const [controls, noise, roads] = sub
    ? await Promise.all([safe(fetcher, `${sub}/development/building-controls`), safe(fetcher, `${sub}/shapes/noise-heatmap?geojson=true`), safe(fetcher, `${sub}/shapes/busy-roads?geojson=true`)])
    : [null, null, null];
  const value = buildContext3D({ gnafId, parcels: dataOf(parcelsRes), controls: controls && dataOf(controls), noise: noise && dataOf(noise), busyRoads: roads && dataOf(roads) });
  if (!suburb) value.notes.push("Couldn't determine the suburb, so no planning controls.");
  if (parcelsRes.status === 200 || parcelsRes.status === 404) {
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(gnafId, { at: Date.now(), value });
  }
  return value;
}

export function clearContext3DCache(): void {
  cache.clear();
}
