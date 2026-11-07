import { describe, expect, it } from "vitest";
import { bboxAround, closestImage, imagesUrl } from "../src/lib/mapillary";

describe("mapillary helpers", () => {
  it("builds a small bbox around the point", () => {
    const [minLon, minLat, maxLon, maxLat] = bboxAround(-33.88, 151.21, 60);
    expect(minLon).toBeLessThan(151.21);
    expect(maxLon).toBeGreaterThan(151.21);
    expect(maxLat - minLat).toBeCloseTo(120 / 111_320, 6);
  });

  it("picks the image nearest the address and skips ones without geometry", () => {
    const im = (id: string, lon: number, lat: number) => ({ id, thumb_1024_url: `u${id}`, computed_geometry: { type: "Point" as const, coordinates: [lon, lat] as const } });
    const pick = closestImage([im("far", 151.212, -33.882), { id: "nogeo", thumb_1024_url: "x" }, im("near", 151.2101, -33.8801)], -33.88, 151.21);
    expect(pick?.id).toBe("near");
    expect(closestImage([], -33.88, 151.21)).toBeNull();
  });

  it("asks only for the fields it needs", () => {
    const u = new URL(imagesUrl("tok", -33.88, 151.21));
    expect(u.searchParams.get("fields")).toContain("thumb_1024_url");
    expect(u.searchParams.get("bbox")?.split(",")).toHaveLength(4);
  });
});
