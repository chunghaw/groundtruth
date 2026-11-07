import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContext3D, clearContext3DCache, getContext3D, heightFromFsr, parseBuildingControls, parseParcels, storeysFor, validLocation, type Fetcher } from "@/lib/context3d";
import { clipLine, clipRing, pointInPolygons, type Pos } from "@/lib/geo";
import { mockUpstream } from "@/lib/mock";

const G = "GANSW704360755";
const sq = (x0: number, y0: number, x1: number, y1: number): Pos[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

describe("geo", () => {
  it("point in polygon respects holes", () => {
    const poly = [[sq(0, 0, 10, 10), sq(4, 4, 6, 6)]];
    expect(pointInPolygons([1, 1], poly)).toBe(true);
    expect(pointInPolygons([5, 5], poly)).toBe(false);
    expect(pointInPolygons([11, 5], poly)).toBe(false);
  });
  it("clips rings and lines to a box", () => {
    const r = clipRing(sq(-5, -5, 5, 5), { minX: 0, minY: 0, maxX: 10, maxY: 10 })!;
    expect(r[0]).toEqual(r[r.length - 1]);
    expect(r.every(([x, y]) => x >= 0 && x <= 5 && y >= 0 && y <= 5)).toBe(true);
    expect(clipRing(sq(20, 20, 30, 30), { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBeNull();
    expect(clipLine([[-5, 5], [15, 5]], { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([[[0, 5], [10, 5]]]);
    expect(clipLine([[-5, 50], [15, 50]], { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
  });
});

describe("parsers tolerate shape drift", () => {
  it("parcels: FeatureCollection under data.parcels, MultiPolygon or Polygon, junk dropped", () => {
    const out = parseParcels({
      parcels: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[sq(0, 0, 1, 1)]] }, properties: { gnaf_pid: "A", is_subject: true } },
          { type: "Feature", geometry: { type: "Polygon", coordinates: [sq(1, 0, 2, 1)] }, properties: { gnaf_pid: "B" } },
          { type: "Feature", geometry: null, properties: {} },
        ],
      },
    });
    expect(out.map((p) => [p.gnafId, p.isSubject])).toEqual([["A", true], ["B", false]]);
  });
  it("building controls: numeric or string values, null blocks", () => {
    const z = parseBuildingControls({ hob: null, fsr: { geojson: { features: [{ geometry: { type: "Polygon", coordinates: [sq(0, 0, 1, 1)] }, properties: { fsr: "2.5:1" } }] } } });
    expect(z.hob).toEqual([]);
    expect(z.fsr[0].value).toBe(2.5);
  });
  it("FSR heuristic and storeys", () => {
    expect(heightFromFsr(3)).toBe(19.2);
    expect(storeysFor(45)).toBe(14);
    expect(heightFromFsr(100)).toBe(80);
  });
});

describe("buildContext3D", () => {
  it("returns unavailable when there are no parcels", () => {
    const r = buildContext3D({ gnafId: G, parcels: null, controls: null, noise: null, busyRoads: null });
    expect(r.available).toBe(false);
    expect(r.lots.features).toEqual([]);
  });
});

describe("getContext3D (mock upstream)", () => {
  beforeEach(() => clearContext3DCache());

  it("builds the Surry Hills block from real lots: subject highlighted, heights 9-45 m, FSR fallback labelled", async () => {
    const r = await getContext3D(G, mockUpstream);
    expect(r.available).toBe(true);
    const lots = r.lots.features;
    expect(lots.length).toBeGreaterThanOrEqual(20);
    expect(lots.filter((f) => f.properties.isSubject)).toHaveLength(1);
    expect(r.subject).toEqual({ maxHeightM: 30, storeys: 9, source: "hob" });
    const hs = lots.map((f) => f.properties.maxHeightM!).filter((h) => h !== null);
    expect(Math.min(...hs)).toBe(9);
    expect(Math.max(...hs)).toBe(45);
    expect(lots.some((f) => f.properties.source === "fsr-estimate" && f.properties.maxHeightM === 19.2)).toBe(true);
    expect(r.heightSource).toBe("mixed");
    expect(r.tallestNeighbour).toMatchObject({ maxHeightM: 45, storeys: 14, source: "hob", direction: "north-west" });
    expect(r.noise?.features.length).toBeGreaterThan(0);
    expect(r.busyRoads?.features.length).toBe(2);
  });

  it("rounds coordinates to 6 dp and clips overlays to the 200 m window", async () => {
    const r = await getContext3D(G, mockUpstream);
    const coords = JSON.stringify([r.lots, r.noise, r.busyRoads]).match(/-?\d+\.\d+/g)!;
    expect(coords.every((c) => c.split(".")[1].length <= 6)).toBe(true);
    const [cx, cy] = r.center!;
    for (const f of r.busyRoads!.features) {
      const pts = (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates).flat();
      for (const [x, y] of pts) {
        expect(Math.abs(x - cx)).toBeLessThan(0.0023);
        expect(Math.abs(y - cy)).toBeLessThan(0.0019);
      }
    }
  });

  it("caches per gnaf and degrades when the suburb is unknown", async () => {
    const fetcher: Fetcher = vi.fn(async (p: string) => (p.endsWith("/profile") ? { status: 404, body: { detail: "x" } } : mockUpstream(p)));
    const a = await getContext3D(G, fetcher);
    const b = await getContext3D(G, fetcher);
    expect(b).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(2); // parcels + profile only, then cached
    expect(a.heightSource).toBe("none");
    expect(a.notes.join(" ")).toMatch(/suburb/);
    expect(a.lots.features.length).toBeGreaterThan(0);
  });

  it("survives a throwing fetcher", async () => {
    const r = await getContext3D(G, async () => { throw new Error("boom"); });
    expect(r.available).toBe(false);
  });
});

describe("subject lot without an upstream flag", () => {
  const lot = (x: number, id: string) => ({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[sq(151.2 + x, -33.9, 151.2 + x + 0.0001, -33.8999)]] }, properties: { gnaf_pid: id, is_subject: false } });
  const parcels = { parcels: { type: "FeatureCollection", features: [lot(0, "A"), lot(0.0001, "B"), lot(0.0002, "C")] } };

  it("uses the home's location to pick its lot and centres on it", () => {
    const r = buildContext3D({ gnafId: "X", parcels, controls: null, noise: null, busyRoads: null, location: [151.20005, -33.89995] });
    expect(r.lots.features.find((f) => f.properties.isSubject)?.properties.gnafId).toBe("A");
    expect(r.center).toEqual([151.20005, -33.89995]);
  });

  it("falls back to the lot in the middle of the parcel window, with a note", () => {
    const r = buildContext3D({ gnafId: "X", parcels, controls: null, noise: null, busyRoads: null });
    expect(r.lots.features.find((f) => f.properties.isSubject)?.properties.gnafId).toBe("B");
    expect(r.notes.join(" ")).toMatch(/inferred/);
  });

  it("rejects implausible location hints", () => {
    expect(validLocation(151.2, -33.9)).toEqual([151.2, -33.9]);
    expect(validLocation(0, 0)).toBeNull();
    expect(validLocation(NaN, -33.9)).toBeNull();
  });
});
