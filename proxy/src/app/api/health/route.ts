import { json, preflight } from "@/lib/http";
import { isMock } from "@/lib/microburbs";
import { indexStatus } from "@/lib/addressIndex";
import { areaSource } from "@/lib/area";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export function GET(req: Request): Response {
  const idx = indexStatus();
  return json(req, { ok: true, mock: isMock(), addressIndex: { loaded: idx.loaded, rows: idx.rows }, area: areaSource() });
}
