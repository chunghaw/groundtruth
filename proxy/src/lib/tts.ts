/**
 * Text-to-speech (ElevenLabs, then OpenAI), server-side only. The API keys never leaves this module and is never logged.
 */
import { createHash } from "node:crypto";

/** "George", a stock ElevenLabs voice (the id used in the ElevenLabs API reference examples). */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const TTS_MODEL = "eleven_multilingual_v2";
export const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } as const;
export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICE = "coral";
const OPENAI_TTS_INSTRUCTIONS = "Warm, natural Australian-friendly tone, relaxed pace, like a friend leaving a voice note.";
const TTS_TIMEOUT_MS = 15_000;

export interface SynthOptions {
  readonly apiKey: string;
  readonly voiceId?: string;
  readonly fetchImpl?: typeof fetch;
}

/** Returns MP3 bytes, or null on any failure (caller falls back to browser speech). */
export async function synthesize(text: string, opts: SynthOptions): Promise<ArrayBuffer | null> {
  const voice = (opts.voiceId || DEFAULT_VOICE_ID).replace(/[^A-Za-z0-9]/g, "");
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "xi-api-key": opts.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) {
      console.error("[groundtruth] tts upstream status", res.status);
      return null;
    }
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch (e) {
    console.error("[groundtruth] tts failed", e instanceof Error ? e.name : "error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI TTS fallback: MP3 bytes or null on any failure. The key is never logged. */
export async function synthesizeOpenAI(text: string, opts: { readonly apiKey: string; readonly fetchImpl?: typeof fetch }): Promise<ArrayBuffer | null> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
  try {
    const res = await f("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: OPENAI_TTS_VOICE, input: text, instructions: OPENAI_TTS_INSTRUCTIONS, response_format: "mp3" }),
    });
    if (!res.ok) {
      console.error("[groundtruth] openai tts upstream status", res.status);
      return null;
    }
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch (e) {
    console.error("[groundtruth] openai tts failed", e instanceof Error ? e.name : "error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** ElevenLabs first, then OpenAI TTS; null when neither is configured or both fail. */
export async function synthesizeAny(
  text: string,
  keys: { readonly elevenLabsKey?: string; readonly voiceId?: string; readonly openAiKey?: string; readonly fetchImpl?: typeof fetch },
): Promise<ArrayBuffer | null> {
  if (keys.elevenLabsKey) {
    const a = await synthesize(text, { apiKey: keys.elevenLabsKey, voiceId: keys.voiceId, fetchImpl: keys.fetchImpl });
    if (a) return a;
  }
  return keys.openAiKey ? synthesizeOpenAI(text, { apiKey: keys.openAiKey, fetchImpl: keys.fetchImpl }) : null;
}

export function scriptHash(script: string): string {
  return createHash("sha256").update(script).digest("hex").slice(0, 16);
}

/** Small in-memory LRU-ish cache keyed by gnafId + script hash. */
export class TtsCache {
  private readonly map = new Map<string, ArrayBuffer>();
  constructor(private readonly max = 64) {}

  private key(gnafId: string, script: string): string {
    return `${gnafId}:${scriptHash(script)}`;
  }

  get(gnafId: string, script: string): ArrayBuffer | undefined {
    const k = this.key(gnafId, script);
    const v = this.map.get(k);
    if (v) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }

  set(gnafId: string, script: string, audio: ArrayBuffer): void {
    const k = this.key(gnafId, script);
    this.map.delete(k);
    this.map.set(k, audio);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}
