import { guard, isGnafId, json, preflight } from "@/lib/http";
import { getContext3D } from "@/lib/context3d";
import { getUpstream } from "@/lib/microburbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

/** Neighbouring lots (200 m) with legally permitted max heights, plus optional noise / busy-road layers. */
export async function GET(req: Request, ctx: { params: Promise<{ gnafId: string }> }): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { gnafId } = await ctx.params;
  if (!isGnafId(gnafId)) return json(req, { error: "invalid gnafId" }, 400);
  try {
    return json(req, await getContext3D(gnafId, getUpstream));
  } catch (e) {
    console.error("[groundtruth] context3d failed", e);
    return json(req, { error: "context3d failed" }, 500);
  }
}
