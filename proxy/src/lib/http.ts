import type { AddressParts } from "./normalise";
import type { ResolveRequest } from "./resolve";
import { isMock } from "./microburbs";

const LISTING_ORIGINS = /^https:\/\/(www\.)?(realestate\.com\.au|domain\.com\.au)$/;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$|^chrome-extension:\/\/[a-z0-9]+$/;

export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return EXTENSION_ORIGIN.test(origin) || LISTING_ORIGINS.test(origin) ? origin : null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req.headers.get("origin"));
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Groundtruth-Client",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * True when a browser request comes from a page served by this same deployment (the /demo page).
 * Browsers send Origin on POST and Referer on same-origin GET; Sec-Fetch-Site, when present, must agree.
 */
export function isSameOriginRequest(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  if (!host) return false;
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const src = originOf(req.headers.get("origin")) ?? originOf(req.headers.get("referer"));
  return src !== null && src === host;
}

/**
 * The public demo page calls the API without the extension token. Headers can be forged by non-browser
 * clients, so this is only on in mock mode (no Microburbs key spend) unless GROUNDTRUTH_DEMO=1; GROUNDTRUTH_DEMO=0 turns it off.
 */
export function demoSameOriginEnabled(): boolean {
  const flag = process.env.GROUNDTRUTH_DEMO;
  if (flag === "0") return false;
  return flag === "1" || isMock();
}

/** Shared-token check. No token configured: open in dev, closed in production. Same-origin demo calls allowed (see above). */
export function checkClient(req: Request): boolean {
  if (demoSameOriginEnabled() && isSameOriginRequest(req)) return true;
  const expected = process.env.GROUNDTRUTH_CLIENT_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  return safeEqual(req.headers.get("x-groundtruth-client") ?? "", expected);
}

const buckets = ((globalThis as { __gtBuckets?: Map<string, { tokens: number; at: number }> }).__gtBuckets ??= new Map());

/** Token bucket: `perMinute` sustained, burst of `burst`. Returns true when the call should be refused. */
export function rateLimited(key: string, perMinute = 120, burst = 60): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  const tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
  if (tokens < 1) {
    buckets.set(key, { tokens, at: now });
    return true;
  }
  buckets.set(key, { tokens: tokens - 1, at: now });
  if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value!);
  return false;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(req) },
  });
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Common guard: token + rate limit. Returns a Response to send, or null to continue. */
export function guard(req: Request): Response | null {
  if (!checkClient(req)) return json(req, { error: "unauthorized" }, 401);
  if (rateLimited(clientKey(req))) return json(req, { error: "rate_limited" }, 429);
  return null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.length <= max ? v.trim() || null : null);

export function parseResolveBody(body: unknown): Parsed<ResolveRequest> {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (!["rea", "domain", "manual"].includes(b.source as string)) return { ok: false, error: "source must be rea|domain|manual" };
  if (typeof b.raw !== "string" || b.raw.length === 0 || b.raw.length > 300) return { ok: false, error: "raw must be a 1-300 char string" };
  let parts: AddressParts | null = null;
  if (b.parts != null) {
    if (typeof b.parts !== "object") return { ok: false, error: "parts must be an object or null" };
    const p = b.parts as Record<string, unknown>;
    parts = { unit: str(p.unit, 20), number: str(p.number, 20), street: str(p.street), suburb: str(p.suburb, 60), state: str(p.state, 10), postcode: str(p.postcode, 10) };
  }
  let bedrooms: number | null = null;
  if (b.bedrooms != null) {
    if (typeof b.bedrooms !== "number" || !Number.isInteger(b.bedrooms) || b.bedrooms < 0 || b.bedrooms > 20) return { ok: false, error: "bedrooms must be an integer 0-20" };
    bedrooms = b.bedrooms;
  }
  return { ok: true, value: { source: b.source as ResolveRequest["source"], raw: b.raw, parts, bedrooms } };
}

export function isGnafId(id: string): boolean {
  return /^[A-Z]{2,6}\d{4,15}$/.test(id);
}
