import { clientKey, corsHeaders, guard, isGnafId, json, preflight, rateLimited } from "@/lib/http";
import { getFacts } from "@/lib/facts";
import { getUpstream } from "@/lib/microburbs";
import { composeBriefing } from "@/lib/briefing";
import { synthesizeAny, TtsCache } from "@/lib/tts";
import { getContext3D } from "@/lib/context3d";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = ((globalThis as { __gtTtsCache?: TtsCache }).__gtTtsCache ??= new TtsCache(64));
const MAX_BODY = 20_000;
const CONTEXT3D_WAIT_MS = 4_000;

/** 3D context ("what can rise next door") is optional: give it a short window, never fail the briefing over it. */
async function context3dFor(gnafId: string): Promise<unknown> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CONTEXT3D_WAIT_MS));
  return Promise.race([getContext3D(gnafId, getUpstream).catch(() => null), timeout]);
}

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

/** Optional body: { context3d?: object } (what can rise next door), if the client already has it. */
async function readContext3d(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY) return null;
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && "context3d" in body ? (body as { context3d: unknown }).context3d : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/briefing/:gnafId → audio/mpeg (script in X-Briefing-Script, URI-encoded) when ElevenLabs or OpenAI TTS
 * succeeds (script written by OpenAI when OPENAI_API_KEY is set and it validates); otherwise JSON { script, audio: null } and the client speaks it with browser TTS.
 */
export async function POST(req: Request, ctx: { params: Promise<{ gnafId: string }> }): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { gnafId } = await ctx.params;
  if (!isGnafId(gnafId)) return json(req, { error: "invalid gnafId" }, 400);
  const context3d = await readContext3d(req);
  let script: string;
  try {
    const [{ facts }, ctx3d] = await Promise.all([getFacts(gnafId, getUpstream), context3d ? Promise.resolve(context3d) : context3dFor(gnafId)]);
    ({ script } = await composeBriefing(gnafId, facts, ctx3d));
  } catch (e) {
    console.error("[groundtruth] briefing facts failed", e instanceof Error ? e.message : e);
    return json(req, { error: "briefing failed" }, 500);
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim() || undefined;
  const openAiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  if (!elevenLabsKey && !openAiKey) return json(req, { script, audio: null });

  let audio = cache.get(gnafId, script) ?? null;
  if (!audio) {
    // Voice costs money: a tighter bucket than the general guard, only for uncached synth calls.
    if (rateLimited(`tts:${clientKey(req)}`, 6, 3)) return json(req, { script, audio: null, reason: "tts_rate_limited" });
    audio = await synthesizeAny(script, { elevenLabsKey, openAiKey, voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() });
    if (!audio) return json(req, { script, audio: null });
    cache.set(gnafId, script, audio);
  }
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Briefing-Script": encodeURIComponent(script),
      "Access-Control-Expose-Headers": "X-Briefing-Script",
      ...corsHeaders(req),
    },
  });
}
