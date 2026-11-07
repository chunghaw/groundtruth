/** Mapillary street-level imagery (CC-BY-SA). Used by the demo page only when NEXT_PUBLIC_MAPILLARY_TOKEN is set. */
export interface MapillaryImage {
  readonly id: string;
  readonly thumb_1024_url: string;
  readonly computed_geometry?: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly creator?: { readonly username?: string };
  readonly captured_at?: number;
}

export interface StreetPhoto {
  readonly url: string;
  readonly pageUrl: string;
  readonly author: string | null;
  readonly capturedAt: string | null;
}

const GRAPH = "https://graph.mapillary.com/images";

/** Bounding box of roughly `metres` around a point: [minLon, minLat, maxLon, maxLat]. */
export function bboxAround(lat: number, lon: number, metres = 60): readonly [number, number, number, number] {
  const dLat = metres / 111_320;
  const dLon = metres / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

export function closestImage(images: readonly MapillaryImage[], lat: number, lon: number): MapillaryImage | null {
  let best: MapillaryImage | null = null;
  let bestD = Infinity;
  for (const im of images) {
    const c = im.computed_geometry?.coordinates;
    if (!c || !im.thumb_1024_url) continue;
    const d = (c[0] - lon) ** 2 * Math.cos((lat * Math.PI) / 180) ** 2 + (c[1] - lat) ** 2;
    if (d < bestD) { bestD = d; best = im; }
  }
  return best;
}

export function imagesUrl(token: string, lat: number, lon: number): string {
  const bbox = bboxAround(lat, lon).map((n) => n.toFixed(6)).join(",");
  const q = new URLSearchParams({ access_token: token, fields: "id,thumb_1024_url,computed_geometry,creator,captured_at", bbox, limit: "25" });
  return `${GRAPH}?${q.toString()}`;
}

export async function fetchStreetPhoto(token: string, lat: number, lon: number, signal?: AbortSignal): Promise<StreetPhoto | null> {
  const res = await fetch(imagesUrl(token, lat, lon), { signal });
  if (!res.ok) throw new Error(`Mapillary ${res.status}`);
  const body = (await res.json()) as { data?: MapillaryImage[] };
  const im = closestImage(body.data ?? [], lat, lon);
  if (!im) return null;
  return {
    url: im.thumb_1024_url,
    pageUrl: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(im.id)}`,
    author: im.creator?.username ?? null,
    capturedAt: im.captured_at ? new Date(im.captured_at).toISOString().slice(0, 10) : null,
  };
}
