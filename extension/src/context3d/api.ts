import { CLIENT_HEADER, CLIENT_TOKEN, PROXY_BASE, REQUEST_TIMEOUT_MS } from '../config';
import { isContext3D, type Context3D, type LatLng } from './types';

let proxy = { base: PROXY_BASE, token: CLIENT_TOKEN };

/** Mirrors configureProxy() in ../api for this endpoint (web demo uses same-origin, no token). */
export function configureContext3DProxy(next: { readonly proxyBase?: string; readonly clientToken?: string }): void {
  proxy = { base: (next.proxyBase ?? proxy.base).replace(/\/$/, ''), token: next.clientToken ?? proxy.token };
}

/** GET /api/context3d/:gnafId[?lat=&lng=]. Throws Error with a user-facing message. */
export async function fetchContext3D(gnafId: string, f: typeof fetch = fetch, location: LatLng | null = null): Promise<Context3D> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS * 2);
  try {
    const at = location && Number.isFinite(location.lat) && Number.isFinite(location.lng) ? `?lat=${location.lat}&lng=${location.lng}` : '';
    const res = await f(`${proxy.base}/api/context3d/${encodeURIComponent(gnafId)}${at}`, {
      signal: ctrl.signal,
      headers: proxy.token ? { [CLIENT_HEADER]: proxy.token } : {},
    });
    if (!res.ok) throw new Error(`Proxy returned HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!isContext3D(body)) throw new Error('Proxy returned a malformed 3D context');
    return body;
  } catch (e) {
    throw new Error(e instanceof Error && !/abort/i.test(e.name) ? e.message : 'Neighbourhood heights timed out');
  } finally {
    clearTimeout(timer);
  }
}
