import { extractDomain } from './domain';
import { extractRea } from './rea';
import { detectSite, listingIdFromUrl } from './site';
import type { Extraction } from './types';

export { detectSite, listingIdFromUrl } from './site';
export { parseAddressLine, formatAddress } from './parseAddress';
export type * from './types';

export interface ExtractOptions { readonly freshLoad: boolean }

/** Extract the listing's address from the page. Reads ONLY address fields. */
export function extractFromDocument(doc: Document, href: string, opts: ExtractOptions): Extraction | null {
  const site = detectSite(href);
  const listingId = listingIdFromUrl(href);
  if (!site || !listingId) return null;
  return site === 'rea' ? extractRea(doc, listingId, opts.freshLoad) : extractDomain(doc, listingId);
}
