/** Background listener for the 3D card: { type: 'gt:context3d', gnafId } -> { ok, data } | { ok: false, error }. */
import { fetchContext3D } from './api';
import type { Context3D } from './types';

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: Context3D }>();
const GNAF = /^[A-Z]{2,6}\d{4,15}$/;

export async function handleContext3D(gnafId: string, f: typeof fetch = fetch): Promise<{ ok: true; data: Context3D } | { ok: false; error: string }> {
  if (!GNAF.test(gnafId)) return { ok: false, error: 'Invalid property id.' };
  const hit = cache.get(gnafId);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, data: hit.data };
  try {
    const data = await fetchContext3D(gnafId, f);
    cache.set(gnafId, { at: Date.now(), data });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg: { type?: string; gnafId?: unknown }, _sender, sendResponse) => {
  if (msg?.type !== 'gt:context3d' || typeof msg.gnafId !== 'string') return false;
  handleContext3D(msg.gnafId).then(sendResponse);
  return true;
});
