/**
 * MOCK upstream for the 3D context card: a believable Surry Hills block (24 lots, HOB 9-45 m,
 * one FSR-only pocket), noise regions and busy roads. Shapes mirror the OpenAPI examples.
 * The geometry is the same for every GNAF; only the subject lot's gnaf_pid changes.
 */
import type { Upstream } from "./microburbs";
import { mPerDegLng, type Pos } from "./geo";

const C: Pos = [151.20905, -33.88155]; // near Foster St, Surry Hills
const toLL = (x: number, y: number): Pos => [Math.round((C[0] + x / mPerDegLng(C[1])) * 1e7) / 1e7, Math.round((C[1] + y / 111_320) * 1e7) / 1e7];
const rect = (x0: number, y0: number, x1: number, y1: number): Pos[] => [toLL(x0, y0), toLL(x1, y0), toLL(x1, y1), toLL(x0, y1), toLL(x0, y0)];
const ok = (data: unknown): Upstream => ({ status: 200, body: { data } });

/** Lots in local metres (x east, y north). Subject = terrace at x[-2,28], y[0,7.5]. */
function lotRects(): Array<[number, number, number, number]> {
  const lots: Array<[number, number, number, number]> = [];
  for (const [y0, y1] of [[-60, -30], [-30, 0], [0, 30], [30, 60]]) lots.push([-80, y0, -10, y1]); // west of Foster Ln: tower sites
  for (let i = 0; i < 12; i++) lots.push([-4, -45 + i * 7.5, 28, -45 + (i + 1) * 7.5]); // terraces
  for (const [y0, y1] of [[-60, -30], [-30, 0], [0, 30], [30, 60]]) lots.push([36, y0, 90, y1]); // east of Riley St
  for (const [x0, x1] of [[-80, -30], [-30, 20], [20, 60], [60, 90]]) lots.push([x0, 70, x1, 105]); // north row
  return lots;
}
const SUBJECT_INDEX = 4 + 6; // terrace y[0,7.5]

function parcelsMock(gnaf: string): Upstream {
  const features = lotRects().map((r, i) => ({
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: [[rect(...r)]] },
    properties: { gnaf_pid: i === SUBJECT_INDEX ? gnaf : `GANSW7${String(10_000_000 + i * 7919).padStart(8, "0")}`, is_subject: i === SUBJECT_INDEX },
  }));
  return ok({ gnaf_pid: gnaf, radius_m: 200, count: features.length, parcels: { type: "FeatureCollection", features } });
}

const hobZone = (h: number, x0: number, y0: number, x1: number, y1: number) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [rect(x0, y0, x1, y1)] },
  properties: { height_m: h, units: "m", band: h > 30 ? "> 30m" : `${h}m`, color: "#fbbf24" },
});

function buildingControlsMock(suburb: string): Upstream {
  return ok({
    area_name: suburb,
    area_level: "suburb",
    hob: {
      zones_mapped: 5,
      most_common_height_m: 12,
      pct_most_common: 40,
      legend: [{ label: "≤ 12m", color: "#fef9c3", pct: 52 }, { label: "12–30m", color: "#fbbf24", pct: 30 }, { label: "> 30m", color: "#b45309", pct: 18 }],
      geojson: {
        type: "FeatureCollection",
        features: [
          hobZone(45, -300, 0, -7, 300), // Elizabeth St corridor north of the subject: towers
          hobZone(27, -300, -300, -7, 0),
          hobZone(12, -7, -300, 32, 66), // terrace strip incl. the subject
          hobZone(22, 32, -300, 300, 0),
          // x[32,300] y[0,66]: deliberately no HOB -> FSR fallback
          hobZone(9, -300, 66, 300, 300), // heritage terraces to the north
        ],
      },
    },
    fsr: {
      median_fsr: 3,
      breakdown: [{ label: "3:1", color: "#c7d2fe", pct: 100 }],
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [rect(-300, -300, 300, 300)] }, properties: { fsr: 3, band: "3:1", color: "#c7d2fe" } }] },
    },
  });
}

function noiseMock(suburb: string): Upstream {
  const region = (color: string, op: number, x0: number, x1: number) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [rect(x0, -400, x1, 400)] }, properties: { color, fill_opacity: op } });
  return ok({
    area_level: "suburb",
    area_name: suburb,
    count: 3,
    geojson: { type: "FeatureCollection", features: [region("#990000", 0.7, -400, -95), region("#e4572e", 0.55, -95, -40), region("#f3a712", 0.4, -40, 10)] },
    heat: [[C[1], C[0] - 0.0012, 0.85]],
    intensity_definition: "Relative noise intensity, 0-1. Not a decibel measurement.",
  });
}

function busyRoadsMock(suburb: string): Upstream {
  const line = (cls: string, a: [number, number], b: [number, number]) => ({ type: "Feature", geometry: { type: "LineString", coordinates: [toLL(...a), toLL(...b)] }, properties: { road_class: cls } });
  return ok({
    area_level: "suburb",
    area_name: suburb,
    count: 2,
    geojson: { type: "FeatureCollection", features: [line("primary", [-100, -500], [-100, 500]), line("secondary", [-500, -70], [500, -70])] },
  });
}

/** Returns an Upstream for 3D-card paths, or null when the path isn't one of ours. */
export function mock3dUpstream(pathname: string): Upstream | null {
  const parcels = pathname.match(/^\/v1\/properties\/([^/]+)\/surroundings\/parcels$/);
  if (parcels) return parcelsMock(decodeURIComponent(parcels[1]));
  const sub = pathname.match(/^\/v1\/suburbs\/([^/]+)\/(development\/building-controls|shapes\/noise-heatmap|shapes\/busy-roads)$/);
  if (!sub) return null;
  const suburb = decodeURIComponent(sub[1]);
  if (sub[2] === "development/building-controls") return buildingControlsMock(suburb);
  if (sub[2] === "shapes/noise-heatmap") return noiseMock(suburb);
  return busyRoadsMock(suburb);
}
