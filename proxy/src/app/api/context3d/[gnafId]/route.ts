import { guard, isGnafId, json, preflight } from "@/lib/http";
import { getContext3D, validLocation } from "@/lib/context3d";
import { getUpstream } from "@/lib/microburbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

/** Neighbouring lots (centred on ?lat=&lng= when given) (200 m) with legally permitted max heights, plus optional noise / busy-road layers. */
export async function GET(req: Request, ctx: { params: Promise<{ gnafId: string }> }): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { gnafId } = await ctx.params;
  if (!isGnafId(gnafId)) return json(req, { error: "invalid gnafId" }, 400);
  try {
    // Optional ?lat=&lng= (the resolved home's position) centres the model on it; ignored if implausible.
    const q = new URL(req.url).searchParams;
    const location = q.has("lat") && q.has("lng") ? validLocation(Number(q.get("lng")), Number(q.get("lat"))) : null;
    return json(req, await getContext3D(gnafId, getUpstream, location));
  } catch (e) {
    console.error("[groundtruth] context3d failed", e);
    return json(req, { error: "context3d failed" }, 500);
  }
}
