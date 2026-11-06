/**
 * The one place the proxy talks to the Microburbs Hackathon API.
 *
 * Adapted from the Microburbs hackathon demo nextjs-suburb-map/src/lib/server/microburbs.ts
 * (MIT License, Copyright (c) 2026 Microburbs): in-memory cache, in-flight de-duplication,
 * a pacer (8 req/s, under the ~10/s per-key limit) and a Retry-After-honouring 429 retry.
 * Next's unstable_cache layer was dropped to keep this module framework-free and testable.
 */
import { mockUpstream } from "./mock";

export const API_BASE = (process.env.MICROBURBS_API_BASE || "https://api-ht.microburbs.com.au").replace(/\/+$/, "");

export interface Upstream {
  status: number;
  body: unknown;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const REQUESTS_PER_SECOND = 8;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 20_000;

type Entry = { at: number; result: Upstream };
const state = ((globalThis as { __gtMicroburbs?: { cache: Map<string, Entry>; inflight: Map<string, Promise<Upstream>>; nextSlot: number } }).__gtMicroburbs ??= {
  cache: new Map(),
  inflight: new Map(),
  nextSlot: 0,
});

export function isMock(): boolean {
  const key = process.env.MICROBURBS_API_KEY;
  return process.env.MOCK === "1" || process.env.MOCK === "true" || !key || key === "YOUR_TEAM_KEY";
}

async function paced(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, state.nextSlot);
  state.nextSlot = slot + 1000 / REQUESTS_PER_SECOND;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function fetchWithRetry(pathAndQuery: string): Promise<Upstream> {
  const key = process.env.MICROBURBS_API_KEY ?? "";
  for (let attempt = 0; ; attempt++) {
    await paced();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${pathAndQuery}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      console.error("[groundtruth] upstream unreachable", pathAndQuery, e instanceof Error ? e.message : e);
      return { status: 502, body: { detail: "Could not reach the Microburbs API." } };
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const wait = Number(res.headers.get("retry-after")) || 1;
      await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
      continue;
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: text.slice(0, 300) };
    }
    if (res.status >= 500) console.error("[groundtruth] upstream", res.status, pathAndQuery);
    return { status: res.status, body };
  }
}

/** GET a Microburbs path (e.g. "/v1/geocode/address?address=..."). 2xx answers are cached. */
export async function getUpstream(pathAndQuery: string): Promise<Upstream> {
  if (isMock()) return mockUpstream(pathAndQuery);
  const hit = state.cache.get(pathAndQuery);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;
  let pending = state.inflight.get(pathAndQuery);
  if (!pending) {
    pending = fetchWithRetry(pathAndQuery).finally(() => state.inflight.delete(pathAndQuery));
    state.inflight.set(pathAndQuery, pending);
  }
  const result = await pending;
  if (result.status >= 200 && result.status < 300) {
    if (state.cache.size >= MAX_CACHE_ENTRIES) state.cache.delete(state.cache.keys().next().value!);
    state.cache.set(pathAndQuery, { at: Date.now(), result });
  }
  return result;
}

export function dataOf<T>(u: Upstream): T | null {
  const b = u.body as { data?: T } | null;
  return b && typeof b === "object" && "data" in b ? (b.data ?? null) : null;
}
