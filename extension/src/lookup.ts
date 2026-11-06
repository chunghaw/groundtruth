import { fetchFacts, ProxyError, resolveAddress } from './api';
import type { FactsResponse, LookupResult, ResolveRequest } from './api-types';
import { TtlCache } from './cache';
import { CACHE_TTL_MS } from './config';

const resolveCache = new TtlCache<LookupResult>(CACHE_TTL_MS);
const factsCache = new TtlCache<FactsResponse>(CACHE_TTL_MS);

export function cacheKey(key: string, req: ResolveRequest): string {
  return `${key}|${req.bedrooms ?? ''}|${req.raw}`;
}

export async function getFacts(gnafId: string, f: typeof fetch = fetch): Promise<FactsResponse> {
  const hit = factsCache.get(gnafId);
  if (hit) return hit;
  const facts = await fetchFacts(gnafId, f);
  factsCache.set(gnafId, facts);
  return facts;
}

/** resolve -> (if gnafId) facts. Never throws; returns a LookupResult. */
export async function lookup(key: string, req: ResolveRequest, f: typeof fetch = fetch): Promise<LookupResult> {
  const ck = cacheKey(key, req);
  const hit = resolveCache.get(ck);
  if (hit) return hit;
  try {
    const resolve = await resolveAddress(req, f);
    let facts: FactsResponse | null = null;
    let factsError: string | undefined;
    if (resolve.gnafId && resolve.state === 'EXACT') {
      try { facts = await getFacts(resolve.gnafId, f); } catch (e) { factsError = (e as Error).message; }
    }
    const result: LookupResult = { ok: true, key, resolve, facts, factsError };
    if (!factsError) resolveCache.set(ck, result);
    return result;
  } catch (e) {
    const err = e instanceof ProxyError ? e : new ProxyError(String((e as Error)?.message ?? e), 'unreachable');
    return { ok: false, key, error: err.message, kind: err.kind };
  }
}
