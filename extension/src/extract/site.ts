import type { Site } from './types';

const REA_LISTING_RE = /^\/property-[a-z0-9]+(?:-[a-z0-9+]+)*-(\d{6,})\/?$/i;
const DOMAIN_LISTING_RE = /^\/[a-z0-9-]+-(\d{7,})\/?$/i;

function parse(href: string): URL | null {
  try { return new URL(href); } catch { return null; }
}

export function detectSite(href: string): Site | null {
  const u = parse(href);
  if (!u) return null;
  if (/(^|\.)realestate\.com\.au$/.test(u.hostname)) return 'rea';
  if (/(^|\.)domain\.com\.au$/.test(u.hostname)) return 'domain';
  return null;
}

/** Trailing listing id from a listing-page URL; null when the URL is not a single listing. */
export function listingIdFromUrl(href: string): string | null {
  const u = parse(href);
  const site = detectSite(href);
  if (!u || !site) return null;
  const m = (site === 'rea' ? REA_LISTING_RE : DOMAIN_LISTING_RE).exec(u.pathname);
  return m ? m[1] : null;
}
