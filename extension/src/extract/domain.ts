import { addressHeading } from './heading';
import { formatAddress, parseAddressLine } from './parseAddress';
import type { AddressParts, Extraction } from './types';

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Read only the address fields from __NEXT_DATA__, and only if it belongs to this listing. */
function readNextData(doc: Document, listingId: string): AddressParts | null {
  const el = doc.getElementById('__NEXT_DATA__');
  if (!el?.textContent) return null;
  try {
    const cp = JSON.parse(el.textContent)?.props?.pageProps?.componentProps;
    if (!cp || str(cp.listingId) !== listingId) return null;
    const number = str(cp.streetNumber);
    const street = str(cp.street);
    const suburb = str(cp.suburb);
    if (!number || !street || !suburb) return null;
    return {
      unit: str(cp.unitNumber) ? str(cp.unitNumber).toUpperCase() : null,
      number: number.toUpperCase(),
      street: titleCase(street),
      suburb: titleCase(suburb),
      state: str(cp.stateAbbreviation) ? str(cp.stateAbbreviation).toUpperCase() : null,
      postcode: str(cp.postcode) || null,
    };
  } catch {
    return null;
  }
}

/** Domain: never parse the slug; never read [data-testid=address-wrapper]. */
export function extractDomain(doc: Document, listingId: string): Extraction | null {
  const nd = readNextData(doc, listingId);
  if (nd) return { source: 'domain', listingId, raw: formatAddress(nd, 'domain'), parts: nd, from: '__NEXT_DATA__' };
  const raw = addressHeading(doc);
  if (!raw) return null;
  return { source: 'domain', listingId, raw, parts: parseAddressLine(raw), from: 'h1' };
}
