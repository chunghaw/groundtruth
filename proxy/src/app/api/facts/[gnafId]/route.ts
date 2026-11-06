import { guard, isGnafId, json, preflight } from "@/lib/http";
import { getFacts } from "@/lib/facts";
import { getUpstream } from "@/lib/microburbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ gnafId: string }> }): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { gnafId } = await ctx.params;
  if (!isGnafId(gnafId)) return json(req, { error: "invalid gnafId" }, 400);
  try {
    return json(req, await getFacts(gnafId, getUpstream));
  } catch (e) {
    console.error("[groundtruth] facts failed", e);
    return json(req, { error: "facts failed" }, 500);
  }
}
