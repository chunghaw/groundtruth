import { CLIENT_HEADER, CLIENT_TOKEN, PROXY_BASE, REQUEST_TIMEOUT_MS } from './config';
import type { FactsResponse, ResolveRequest, ResolveResponse } from './api-types';

export class ProxyError extends Error {
  constructor(message: string, readonly kind: 'unreachable' | 'http' | 'bad-response') { super(message); }
}

type Fetch = typeof fetch;

let proxy = { base: PROXY_BASE, token: CLIENT_TOKEN };

/** Point the client at another proxy (used by the web demo build). Replaces, never mutates, the config. */
export function configureProxy(next: { readonly proxyBase?: string; readonly clientToken?: string }): void {
  proxy = { base: (next.proxyBase ?? proxy.base).replace(/\/$/, ''), token: next.clientToken ?? proxy.token };
}

async function call<T>(path: string, init: RequestInit, f: Fetch): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await f(`${proxy.base}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(proxy.token ? { [CLIENT_HEADER]: proxy.token } : {}), ...(init.headers ?? {}) },
    });
  } catch (e) {
    throw new ProxyError(`Groundtruth proxy unreachable at ${proxy.base || 'this site'}`, 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ProxyError(`Proxy returned HTTP ${res.status}`, 'http');
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProxyError('Proxy returned a malformed response', 'bad-response');
  }
}

export function isResolveResponse(x: any): x is ResolveResponse {
  return !!x && typeof x.state === 'string' && typeof x.receipt === 'object' && Array.isArray(x.candidates ?? []);
}

export async function resolveAddress(req: ResolveRequest, f: Fetch = fetch): Promise<ResolveResponse> {
  const r = await call<unknown>('/api/resolve', { method: 'POST', body: JSON.stringify(req) }, f);
  if (!isResolveResponse(r)) throw new ProxyError('Proxy resolve response missing fields', 'bad-response');
  return { ...r, candidates: (r as ResolveResponse).candidates ?? [] };
}

export async function fetchFacts(gnafId: string, f: Fetch = fetch): Promise<FactsResponse> {
  const r = await call<FactsResponse>(`/api/facts/${encodeURIComponent(gnafId)}`, { method: 'GET' }, f);
  if (!r || typeof r.facts !== 'object') throw new ProxyError('Proxy facts response missing fields', 'bad-response');
  return r;
}

export interface BriefingPayload { readonly script: string; readonly audio: ArrayBuffer | null }
const BRIEFING_TIMEOUT_MS = 20_000; // voice synthesis is slower than a facts lookup

/** POST /api/briefing/:gnafId. Audio replies carry the script in X-Briefing-Script; JSON replies have audio: null. */
export async function fetchBriefing(gnafId: string, f: Fetch = fetch, context3d?: unknown): Promise<BriefingPayload> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BRIEFING_TIMEOUT_MS);
  let res: Response;
  try {
    res = await f(`${proxy.base}/api/briefing/${encodeURIComponent(gnafId)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(proxy.token ? { [CLIENT_HEADER]: proxy.token } : {}) },
      body: JSON.stringify(context3d ? { context3d } : {}),
    });
    if (!res.ok) throw new ProxyError(`Proxy returned HTTP ${res.status}`, 'http');
    if (/audio\//i.test(res.headers.get('content-type') ?? '')) {
      const script = decodeURIComponent(res.headers.get('x-briefing-script') ?? '');
      return { script, audio: await res.arrayBuffer() };
    }
    const body = (await res.json()) as { script?: unknown };
    if (typeof body?.script !== 'string') throw new ProxyError('Proxy briefing response missing script', 'bad-response');
    return { script: body.script, audio: null };
  } catch (e) {
    if (e instanceof ProxyError) throw e;
    throw new ProxyError(`Groundtruth proxy unreachable at ${proxy.base || 'this site'}`, 'unreachable');
  } finally {
    clearTimeout(timer);
  }
}
