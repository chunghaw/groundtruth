import { getUpstream, dataOf, isMock } from "./microburbs";
import { getAddressIndex } from "./addressIndex";
import { isInArea, setAreaSuburbs, areaSource } from "./area";
import type { GeoCandidate, GeocodeResult, ResolveDeps } from "./resolve";

export async function geocode(query: string): Promise<GeocodeResult> {
  const r = await getUpstream(`/v1/geocode/address?address=${encodeURIComponent(query)}`);
  if (r.status === 403) return { status: "outside" };
  if (r.status >= 200 && r.status < 300) return { status: "ok", candidates: dataOf<GeoCandidate[]>(r) ?? [] };
  return { status: "error", message: `upstream ${r.status}` };
}

export async function basics(gnafId: string): Promise<{ bed_count: number | null } | null> {
  const r = await getUpstream(`/v1/properties/${encodeURIComponent(gnafId)}/basics/all`);
  return r.status === 200 ? dataOf<{ bed_count: number | null }>(r) : null;
}

let areaLoad: Promise<void> | null = null;

/** Once per process: replace the fallback suburb list with the API's City of Sydney list. */
export function loadAreaFromApi(): Promise<void> {
  if (isMock() || areaSource() === "api") return Promise.resolve();
  areaLoad ??= (async () => {
    try {
      const r = await getUpstream(`/v1/suburbs/list?lga=${encodeURIComponent("Sydney")}`);
      const rows = dataOf<Array<{ suburb?: string; name?: string }>>(r) ?? [];
      setAreaSuburbs(rows.map((x) => x.suburb ?? x.name ?? "").filter(Boolean));
    } catch (e) {
      console.error("[groundtruth] suburb list load failed; using fallback", e);
      areaLoad = null;
    }
  })();
  return areaLoad;
}

export function liveDeps(): ResolveDeps {
  return { geocode, basics, index: getAddressIndex(), isInArea };
}
