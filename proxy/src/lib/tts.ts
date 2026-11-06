/**
 * ElevenLabs text-to-speech, server-side only. The API key never leaves this module and is never logged.
 */
import { createHash } from "node:crypto";

/** "George", a stock ElevenLabs voice (the id used in the ElevenLabs API reference examples). */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const TTS_MODEL = "eleven_flash_v2_5";
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
      body: JSON.stringify({ text, model_id: TTS_MODEL }),
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
