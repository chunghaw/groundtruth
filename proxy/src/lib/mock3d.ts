/**
 * MOCK upstream for the 3D context card: real Surry Hills cadastre lots (see mock3d-lots.ts) with
 * invented-but-plausible height controls (HOB 9-45 m, one FSR-only pocket), noise and busy roads.
 * Shapes mirror the OpenAPI examples. Same geometry for every GNAF; only the subject's gnaf_pid changes.
 */
import type { Upstream } from "./microburbs";
import { mPerDegLng, type Pos } from "./geo";
import { MOCK_CENTRE, MOCK_LOT_RINGS, MOCK_SUBJECT_INDEX } from "./mock3d-lots";

const C: Pos = MOCK_CENTRE; // Surry Hills; the lots below are real cadastre outlines around it
const toLL = (x: number, y: number): Pos => [Math.round((C[0] + x / mPerDegLng(C[1])) * 1e7) / 1e7, Math.round((C[1] + y / 111_320) * 1e7) / 1e7];
const rect = (x0: number, y0: number, x1: number, y1: number): Pos[] => [toLL(x0, y0), toLL(x1, y0), toLL(x1, y1), toLL(x0, y1), toLL(x0, y0)];
const ok = (data: unknown): Upstream => ({ status: 200, body: { data } });

function parcelsMock(gnaf: string): Upstream {
  const features = MOCK_LOT_RINGS.map((ring, i) => ({
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: [[ring]] },
    properties: { gnaf_pid: i === MOCK_SUBJECT_INDEX ? gnaf : `GANSW7${String(10_000_000 + i * 7919).padStart(8, "0")}`, is_subject: i === MOCK_SUBJECT_INDEX },
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
          // local metres from the home (x east, y north); the subject's terrace strip stays at 12 m
          hobZone(45, -300, 25, -45, 300), // north-west: tower sites
          hobZone(27, -300, -300, -45, 25), // west: mid-rise
          hobZone(12, -45, -300, 45, 300), // Crown St strip incl. the subject
          hobZone(22, 45, -300, 300, -30), // south-east
          // x[45,300] y[-30,40]: deliberately no HOB -> FSR fallback
          hobZone(9, 45, 40, 300, 300), // heritage terraces, north-east
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
