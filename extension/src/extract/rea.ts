import { addressHeading } from './heading';
import { parseAddressLine } from './parseAddress';
import type { AddressParts, Extraction } from './types';

interface LdAddress { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string }

/** Find a JSON-LD Residence-like address. Address fields only; everything else is discarded. */
function readJsonLdAddress(doc: Document): LdAddress | null {
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data: unknown = JSON.parse(el.textContent ?? '');
      const nodes = Array.isArray(data) ? data : [data, ...(((data as any)?.['@graph']) ?? [])];
      for (const n of nodes) {
        const a = (n as any)?.address;
        if (a && typeof a === 'object' && typeof a.streetAddress === 'string') {
          return { streetAddress: a.streetAddress, addressLocality: a.addressLocality, addressRegion: a.addressRegion, postalCode: a.postalCode };
        }
      }
    } catch {
      // malformed JSON-LD: ignore, the h1 remains authoritative
    }
  }
  return null;
}

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function agrees(a: AddressParts, b: AddressParts): boolean {
  return norm(a.unit) === norm(b.unit) && norm(a.number) === norm(b.number)
    && norm(a.street) === norm(b.street) && norm(a.suburb) === norm(b.suburb)
    && (!a.postcode || !b.postcode || a.postcode === b.postcode);
}

export function extractRea(doc: Document, listingId: string, freshLoad: boolean): Extraction | null {
  const raw = addressHeading(doc);
  if (!raw) return null;
  const parts = parseAddressLine(raw);
  // Never touch window.ArgonautExchange: stale after SPA nav and holds the agency's own address.
  if (parts && freshLoad) {
    const ld = readJsonLdAddress(doc);
    if (ld) {
      const ldParts = parseAddressLine(`${ld.streetAddress}, ${ld.addressLocality ?? ''}, ${ld.addressRegion ?? ''} ${ld.postalCode ?? ''}`);
      if (ldParts && agrees(parts, ldParts)) {
        return { source: 'rea', listingId, raw, parts: { ...parts, state: parts.state ?? ldParts.state, postcode: parts.postcode ?? ldParts.postcode }, from: 'h1+json-ld' };
      }
    }
  }
  return { source: 'rea', listingId, raw, parts, from: 'h1' };
}
