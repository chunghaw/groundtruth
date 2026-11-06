/** Proxy base. Switch to the deployed origin for the demo build (must also be in manifest host_permissions). */
export const PROXY_BASE: string = (globalThis as any).__GT_PROXY_BASE__ ?? 'http://localhost:3000';

/** Shared client token for the proxy (NOT the Microburbs key; that lives only in proxy env). */
export const CLIENT_TOKEN: string = (globalThis as any).__GT_CLIENT_TOKEN__ ?? 'groundtruth-hackathon-2026';
export const CLIENT_HEADER = 'X-Groundtruth-Client';

export const REQUEST_TIMEOUT_MS = 8000;
export const CACHE_TTL_MS = 10 * 60 * 1000;
