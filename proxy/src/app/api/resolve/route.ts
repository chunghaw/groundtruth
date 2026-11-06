import { guard, json, parseResolveBody, preflight } from "@/lib/http";
import { resolve } from "@/lib/resolve";
import { liveDeps, loadAreaFromApi } from "@/lib/upstreamDeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid JSON" }, 400);
  }
  const parsed = parseResolveBody(body);
  if (!parsed.ok) return json(req, { error: parsed.error }, 400);
  try {
    await loadAreaFromApi();
    return json(req, await resolve(parsed.value, liveDeps()));
  } catch (e) {
    console.error("[groundtruth] resolve failed", e);
    return json(req, { error: "resolve failed" }, 500);
  }
}
